const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // uuid@8 funciona com require
const app = express();
const PORT = process.env.PORT || 3000;

// Rotas estáticas
app.use(express.static("public"));
app.use("/storage", express.static(path.join(__dirname, "storage"))); // pasta para frames e vídeos

// Criar pastas se não existirem
if (!fs.existsSync("storage")) fs.mkdirSync("storage");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// Configuração do multer
const upload = multer({ dest: "uploads/" });

// Função para remover diretórios com segurança
function removeDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[CLEANUP] Pasta removida: ${dir}`);
    }
}

// ===================================
// 1️⃣ Extrair frames do vídeo
// ===================================
app.post("/api/upload", upload.single("video"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum vídeo enviado" });

    const videoPath = req.file.path;
    const id = uuidv4();
    const framesDir = path.join(__dirname, "storage", id, "frames");

    fs.mkdirSync(framesDir, { recursive: true });
    console.log(`[UPLOAD] Recebido vídeo: ${videoPath}`);
    console.log(`[PROCESS] Extraindo frames em: ${framesDir}`);

    ffmpeg(videoPath)
        .outputOptions("-vsync 0") // garantir todos os frames
        .output(path.join(framesDir, "frame_%06d.png"))
        .on("end", () => {
            console.log("[SUCCESS] Frames extraídos com sucesso!");
            fs.unlinkSync(videoPath); // remover vídeo temporário

            // Listar imagens
            const frames = fs.readdirSync(framesDir)
                .map(f => `/storage/${id}/frames/${f}`);

            // Remover pasta após 10 minutos
            setTimeout(() => removeDir(path.join(__dirname, "storage", id)), 10 * 60 * 1000);

            res.json({ id, frames });
        })
        .on("error", (err) => {
            console.error("[ERROR] Falha ao extrair frames:", err.message);
            removeDir(path.join(__dirname, "storage", id));
            fs.unlinkSync(videoPath);
            res.status(500).json({ error: "Erro ao processar vídeo" });
        })
        .run();
});

// ===================================
// 2️⃣ Reconstruir vídeo a partir de frames
// ===================================
app.post("/api/reconstruct", upload.array("frames", 3000), async (req, res) => {
    if (!req.files.length) return res.status(400).json({ error: "Nenhuma imagem enviada" });

    const id = uuidv4();
    const baseDir = path.join(__dirname, "storage", id);
    const framesDir = path.join(baseDir, "frames");
    const outputDir = path.join(baseDir, "output");
    const outputVideo = path.join(outputDir, "reconstructed.mp4");

    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Mover frames enviados para pasta
    req.files.forEach((file, i) => {
        const newPath = path.join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
        fs.renameSync(file.path, newPath);
    });

    console.log(`[RECONSTRUCT] Iniciando reconstrução do vídeo...`);

    ffmpeg()
        .addInput(path.join(framesDir, "frame_%06d.png"))
        .inputFPS(25)
        .outputOptions(["-c:v libx264", "-pix_fmt yuv420p"])
        .output(outputVideo)
        .on("end", () => {
            console.log(`[SUCCESS] Vídeo reconstruído: ${outputVideo}`);
            // Limpeza após 10 minutos
            setTimeout(() => removeDir(baseDir), 10 * 60 * 1000);
            res.json({ videoUrl: `/storage/${id}/output/reconstructed.mp4` });
        })
        .on("error", (err) => {
            console.error("[ERROR] Reconstrução falhou:", err.message);
            removeDir(baseDir);
            res.status(500).json({ error: "Falha ao reconstruir vídeo" });
        })
        .run();
});

// Teste de ping
app.get("/api/ping", (req, res) => res.json({ ok: true }));

// Iniciar servidor
app.listen(PORT, () => console.log(`[SERVER] Rodando na porta ${PORT}`));
