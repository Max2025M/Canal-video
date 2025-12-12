const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use("/storage", express.static(path.join(__dirname, "storage")));

if (!fs.existsSync("storage")) fs.mkdirSync("storage");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const upload = multer({ dest: "uploads/" });

function removeDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[CLEANUP] Pasta removida: ${dir}`);
}

// Extrair frames do vídeo
app.post("/api/upload", upload.single("video"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum vídeo enviado" });

    const videoPath = req.file.path;
    const id = uuidv4();
    const framesDir = path.join(__dirname, "storage", id, "frames");

    fs.mkdirSync(framesDir, { recursive: true });

    ffmpeg(videoPath)
        .outputOptions("-vsync 0")
        .output(path.join(framesDir, "frame_%06d.png"))
        .on("end", () => {
            fs.unlinkSync(videoPath);
            const frames = fs.readdirSync(framesDir)
                .map(f => `/storage/${id}/frames/${f}`);
            setTimeout(() => removeDir(path.join(__dirname, "storage", id)), 10*60*1000);
            res.json({ id, frames });
        })
        .on("error", (err) => {
            removeDir(path.join(__dirname, "storage", id));
            fs.unlinkSync(videoPath);
            res.status(500).json({ error: "Erro ao processar vídeo" });
        })
        .run();
});

// Reconstruir vídeo a partir dos frames
app.post("/api/reconstruct", upload.array("frames", 3000), async (req, res) => {
    if (!req.files.length) return res.status(400).json({ error: "Nenhuma imagem enviada" });

    const id = uuidv4();
    const baseDir = path.join(__dirname, "storage", id);
    const framesDir = path.join(baseDir, "frames");
    const outputDir = path.join(baseDir, "output");
    const outputVideo = path.join(outputDir, "reconstructed.mp4");

    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    req.files.forEach((file, i) => {
        const newPath = path.join(framesDir, `frame_${String(i).padStart(6,"0")}.png`);
        fs.renameSync(file.path, newPath);
    });

    ffmpeg()
        .addInput(path.join(framesDir, "frame_%06d.png"))
        .inputFPS(25)
        .outputOptions(["-c:v libx264", "-pix_fmt yuv420p"])
        .output(outputVideo)
        .on("end", () => {
            setTimeout(() => removeDir(baseDir), 10*60*1000);
            res.json({ videoUrl: `/storage/${id}/output/reconstructed.mp4` });
        })
        .on("error", (err) => {
            removeDir(baseDir);
            res.status(500).json({ error: "Falha ao reconstruir vídeo" });
        })
        .run();
});

app.listen(PORT, () => console.log(`[SERVER] Rodando na porta ${PORT}`));
