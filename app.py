from flask import Flask, render_template, request, jsonify, send_file
from pydub import AudioSegment
import webrtcvad
import os
import threading

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progress_dict = {}  # Para armazenar progresso por arquivo

def remove_silence_preserve_volume(audio_path, output_path, file_id):
    print(f"[LOG] Processando arquivo: {audio_path}")

    # Carregar e normalizar áudio para mono 16-bit PCM 16kHz
    audio = AudioSegment.from_file(audio_path)
    audio = audio.set_channels(1)
    audio = audio.set_frame_rate(16000)
    audio = audio.set_sample_width(2)  # 16-bit PCM

    original_dBFS = audio.dBFS  # Salva o volume original

    samples = audio.get_array_of_samples()
    sample_rate = audio.frame_rate
    vad = webrtcvad.Vad(2)  # Sensibilidade média

    frame_ms = 30
    frame_size = int(sample_rate * frame_ms / 1000) * audio.frame_width

    new_audio = AudioSegment.empty()
    total_frames = len(samples) // (frame_size // audio.frame_width)

    for i in range(0, len(samples), frame_size // audio.frame_width):
        frame = samples[i:i + frame_size // audio.frame_width].tobytes()
        if len(frame) != frame_size:
            continue  # ignora frames incompletos
        try:
            if vad.is_speech(frame, sample_rate):
                start_ms = i * 1000 // sample_rate
                end_ms = (i + frame_size // audio.frame_width) * 1000 // sample_rate
                new_audio += audio[start_ms:end_ms]
        except Exception as e:
            print(f"[WARN] Frame ignorado: {e}")
        # Atualiza progresso
        progress_dict[file_id] = min(100, int((i / (frame_size // audio.frame_width)) / total_frames * 100))

    # Ajusta volume final para igualar ao original
    if len(new_audio) > 0:
        change_in_dBFS = original_dBFS - new_audio.dBFS
        new_audio = new_audio.apply_gain(change_in_dBFS)

    # Exporta como MP3
    new_audio.export(output_path, format="mp3")
    progress_dict[file_id] = 100
    print(f"[LOG] Processamento concluído e áudio final exportado: {output_path}")

@app.route("/")
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

    thread = threading.Thread(target=remove_silence_preserve_volume, args=(filepath, output_path, file_id))
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
