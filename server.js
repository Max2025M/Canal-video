import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execSync } from "child_process";
import fsPromises from "fs/promises";
import Vad from "node-vad";
import WavDecoder from "wav-decoder";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: "uploads/" });

// Servir frontend e uploads
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// Criar pastas
if (!fs.existsSync(path.join(__dirname, "public/uploads"))) {
  fs.mkdirSync(path.join(__dirname, "public/uploads"), { recursive: true });
}

// Função para converter qualquer áudio para WAV PCM
async function convertToWav(inputPath) {
  const wavPath = inputPath + ".wav";
  console.log(`[LOG] Convertendo para WAV: ${inputPath} -> ${wavPath}`);
  execSync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`);
  return wavPath;
}

// Função para remover silêncio usando VAD
async function removeSilenceVAD(inputPath, outputPath) {
  console.log(`[LOG] Iniciando remoção de silêncio com VAD: ${inputPath}`);
  const wavPath = await convertToWav(inputPath);
  const buffer = await fsPromises.readFile(wavPath);
  const audioData = await WavDecoder.decode(buffer);
  const vad = new Vad(Vad.Mode.NORMAL);

  const sampleRate = audioData.sampleRate;
  const channelData = audioData.channelData[0]; // mono
  const frameSize = sampleRate * 0.03; // 30ms por frame
  let chunks = [];

  for (let i = 0; i < channelData.length; i += frameSize) {
    const frame = channelData.slice(i, i + frameSize);
    const int16Array = new Int16Array(frame.length);
    for (let j = 0; j < frame.length; j++) int16Array[j] = frame[j] * 32767;
    const bufferFrame = Buffer.from(int16Array.buffer);
    const result = await vad.processAudio(bufferFrame, sampleRate);
    if (result === Vad.Event.VOICE) {
      const startSec = i / sampleRate;
      const durationSec = frame.length / sampleRate;
      chunks.push({ start: startSec, duration: durationSec });
    }
  }

  if (!chunks.length) throw new Error("Nenhuma voz detectada.");

  // Criar filtro ffmpeg para manter apenas trechos com voz
  const filter = chunks.map(c => `between(t,${c.start},${c.start + c.duration})`).join("+");
  console.log(`[LOG] Comando ffmpeg para manter voz: ${filter}`);

  execSync(`ffmpeg -y -i "${inputPath}" -af "aselect='${filter}',aresample=async=1" "${outputPath}"`);
  console.log(`[LOG] Áudio processado: ${outputPath}`);
}

// Endpoint de processamento
app.post("/process-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("Nenhum arquivo enviado");

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname);
    const outputPath = `uploads/processed_${Date.now()}${ext}`;

    await removeSilenceVAD(inputPath, outputPath);

    // Obter duração final
    const duration = execSync(
      `ffprobe -i "${outputPath}" -show_entries format=duration -v quiet -of csv="p=0"`
    ).toString().trim();

    const publicPath = path.join(__dirname, "public/uploads", path.basename(outputPath));
    fs.renameSync(outputPath, publicPath);
    fs.unlinkSync(inputPath);

    console.log(`[LOG] Processamento finalizado. Duração: ${duration} segundos`);

    res.json({
      processedAudioUrl: `/uploads/${path.basename(outputPath)}`,
      duration: parseFloat(duration).toFixed(2)
    });
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    res.status(500).send("Erro ao processar áudio com VAD");
  }
});

app.listen(PORT, () => console.log(`[LOG] Servidor rodando na porta ${PORT}`));
