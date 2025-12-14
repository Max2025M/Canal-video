from flask import Flask, render_template, request, jsonify, send_file
from pydub import AudioSegment
import webrtcvad
import os
import threading
import time

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progress_dict = {}  # Para armazenar progresso por arquivo

def remove_silence(audio_path, output_path, file_id):
    audio = AudioSegment.from_file(audio_path)
    samples = audio.get_array_of_samples()
    sample_rate = audio.frame_rate

    vad = webrtcvad.Vad(2)
    frame_ms = 30
    frame_size = int(sample_rate * frame_ms / 1000) * audio.frame_width

    new_audio = AudioSegment.empty()
    total_frames = len(samples) // frame_size

    for i in range(0, len(samples), frame_size):
        frame = samples[i:i+frame_size].tobytes()
        if len(frame) < frame_size:
            break
        if vad.is_speech(frame, sample_rate):
            start_ms = i * 1000 // sample_rate
            end_ms = (i + frame_size) * 1000 // sample_rate
            new_audio += audio[start_ms:end_ms]
        # Atualiza progresso
        progress_dict[file_id] = min(100, int((i/frame_size)/total_frames*100))

    new_audio.export(output_path, format="mp3")
    progress_dict[file_id] = 100
    print(f"[LOG] Processamento concluído: {output_path}")

@app.route("/", methods=["GET", "POST"])
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    if "audio_file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado!"}), 400
    file = request.files["audio_file"]
    if file.filename == "":
        return jsonify({"error": "Nenhum arquivo selecionado!"}), 400

    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    print(f"[LOG] Arquivo enviado: {file.filename}")

    file_id = file.filename.replace(" ", "_")
    output_path = os.path.join(UPLOAD_FOLDER, "processed_" + file.filename)

    # Inicia thread para processar áudio
    thread = threading.Thread(target=remove_silence, args=(filepath, output_path, file_id))
    thread.start()

    return jsonify({"file_id": file_id, "filename": file.filename})

@app.route("/progress/<file_id>")
def progress(file_id):
    return jsonify({"progress": progress_dict.get(file_id, 0)})

@app.route("/download/<file_id>")
def download(file_id):
    path = os.path.join(UPLOAD_FOLDER, "processed_" + file_id)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    return "Arquivo não encontrado", 404

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    print(f"[LOG] Servidor iniciado na porta {port}")
    app.run(host="0.0.0.0", port=port)
