const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

// Criar diretórios se não existirem
["uploads", "frames", "output"].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// 🔹 EXTRAI FRAMES DO VÍDEO
app.post("/api/upload", upload.single("video"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum vídeo enviado" });

    const videoPath = req.file.path;
    const outDir = `frames/${Date.now()}`;

    fs.mkdirSync(outDir);

    console.log("Extraindo frames...");

    ffmpeg(videoPath)
        .on("end", () => {
            const files = fs.readdirSync(outDir).map(f => `/${outDir}/${f}`);

            console.log("Frames extraídos:", files.length);

            setTimeout(() => fs.rmSync(outDir, { recursive: true, force: true }), 600000);
            fs.unlinkSync(videoPath);

            res.json({ frames: files });
        })
        .on("error", err => {
            console.error("Erro no FFmpeg:", err);
            res.status(500).json({ error: "Erro ao processar vídeo" });
        })
        .save(`${outDir}/frame-%04d.png`);
});


// 🔹 RECONSTRÓI VÍDEO A PARTIR DE FRAMES
app.post("/api/reconstruct", upload.array("frames"), async (req, res) => {
    if (!req.files.length) return res.status(400).json({ error: "Nenhuma imagem enviada" });

    const dir = `frames/${Date.now()}`;
    const output = `output/${Date.now()}.mp4`;

    fs.mkdirSync(dir);

    req.files.forEach((f, i) => {
        fs.renameSync(f.path, `${dir}/frame-${String(i).padStart(4, "0")}.png`);
    });

    console.log("Reconstruindo vídeo...");

    ffmpeg(`${dir}/frame-%04d.png`)
        .inputFPS(30)
        .on("end", () => {
            console.log("Vídeo reconstruído:", output);

            setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 600000);
            setTimeout(() => fs.unlinkSync(output), 600000);

            res.json({ videoUrl: "/" + output });
        })
        .on("error", err => {
            console.error("Erro na reconstrução:", err);
            res.status(500).json({ error: "Falha ao reconstruir vídeo" });
        })
        .save(output);
});

// Servidor
app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
