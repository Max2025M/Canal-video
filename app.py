from flask import Flask, render_template, request, jsonify, send_file
from pydub import AudioSegment
import webrtcvad
import os
import threading

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progress_dict = {}

# ===============================
# FUNÇÃO PRINCIPAL (ROBUSTA)
# ===============================
def remove_silence_long_audio(audio_path, output_path, file_id):
    print(f"[LOG] Iniciando processamento: {audio_path}")

    # ----- carregar áudio original -----
    original = AudioSegment.from_file(audio_path)
    orig_channels = original.channels
    orig_rate = original.frame_rate
    orig_width = original.sample_width
    duration_ms = len(original)

    # ----- normalizar SOMENTE para VAD -----
    vad_audio = (
        original
        .set_channels(1)
        .set_frame_rate(16000)
        .set_sample_width(2)  # PCM 16-bit
    )

    vad = webrtcvad.Vad(2)

    frame_ms = 30
    frame_bytes = int(16000 * frame_ms / 1000) * 2  # 16kHz * 2 bytes
    raw = vad_audio.raw_data

    voiced_ranges = []
    in_voice = False
    start_ms = 0

    total_frames = len(raw) // frame_bytes
    processed_frames = 0

    # ----- loop eficiente (SEM concatenação) -----
    for i in range(0, len(raw), frame_bytes):
        frame = raw[i:i + frame_bytes]
        if len(frame) != frame_bytes:
            break

        is_speech = vad.is_speech(frame, 16000)
        current_ms = int(i / len(raw) * duration_ms)

        if is_speech and not in_voice:
            start_ms = current_ms
            in_voice = True

        elif not is_speech and in_voice:
            voiced_ranges.append((start_ms, current_ms))
            in_voice = False

        processed_frames += 1
        progress_dict[file_id] = int((processed_frames / total_frames) * 90)

    if in_voice:
        voiced_ranges.append((start_ms, duration_ms))

    print(f"[LOG] Segmentos de voz detectados: {len(voiced_ranges)}")

    # ----- corte final (rápido e estável) -----
    final_audio = AudioSegment.empty()
    for start, end in voiced_ranges:
        final_audio += original[start:end]

    # ----- boost leve de volume -----
    final_audio = final_audio + 4  # +4dB seguro para áudio longo

    # ----- restaurar propriedades originais -----
    final_audio = (
        final_audio
        .set_channels(orig_channels)
        .set_frame_rate(orig_rate)
        .set_sample_width(orig_width)
    )

    # ----- exportar MP3 -----
    final_audio.export(
        output_path,
        format="mp3",
        bitrate="192k"
    )

    progress_dict[file_id] = 100
    print(f"[LOG] Finalizado com sucesso: {output_path}")

# ===============================
# ROTAS
# ===============================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("audio_file")
    if not file or file.filename == "":
        return jsonify({"error": "Arquivo inválido"}), 400

    filename = file.filename.replace(" ", "_")
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    output_path = os.path.join(UPLOAD_FOLDER, f"processed_{filename}")

    file.save(input_path)
    print(f"[LOG] Upload recebido: {filename}")

    progress_dict[filename] = 0

    thread = threading.Thread(
        target=remove_silence_long_audio,
        args=(input_path, output_path, filename),
        daemon=True
    )
    thread.start()

    return jsonify({"file_id": filename})

@app.route("/progress/<file_id>")
def progress(file_id):
    return jsonify({"progress": progress_dict.get(file_id, 0)})

@app.route("/download/<file_id>")
def download(file_id):
    path = os.path.join(UPLOAD_FOLDER, f"processed_{file_id}")
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    return "Arquivo não encontrado", 404

# ===============================
# MAIN
# ===============================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[LOG] Servidor rodando na porta {port}")
    app.run(host="0.0.0.0", port=port)
