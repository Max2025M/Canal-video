import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do multer
const upload = multer({ dest: "uploads/" });

// Servir frontend
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// Endpoint para remover silêncio
app.post("/process-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("Nenhum arquivo enviado");

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname);
    const outputPath = `uploads/processed_${Date.now()}${ext}`;

    // Comando ffmpeg para remover silêncio
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -af silenceremove=stop_periods=-1:stop_threshold=-50dB:stop_duration=0.5 "${outputPath}" -y`;

    exec(ffmpegCmd, (error) => {
      if (error) {
        console.error(error);
        return res.status(500).send("Erro ao processar áudio");
      }

      // Obter duração do áudio processado
      exec(
        `ffprobe -i "${outputPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
        (err, stdout) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Erro ao obter duração");
          }

          const duration = parseFloat(stdout).toFixed(2);

          // Move arquivo processado para pasta pública
          const publicPath = path.join(__dirname, "public/uploads", path.basename(outputPath));
          fs.renameSync(outputPath, publicPath);

          // Remove arquivo original
          fs.unlinkSync(inputPath);

          res.json({
            processedAudioUrl: `/uploads/${path.basename(outputPath)}`,
            duration: duration
          });
        }
      );
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro inesperado");
  }
});

// Criar pastas públicas se não existirem
if (!fs.existsSync(path.join(__dirname, "public/uploads"))) {
  fs.mkdirSync(path.join(__dirname, "public/uploads"), { recursive: true });
}

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
