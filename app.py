from flask import Flask, render_template, request, jsonify, send_file
from pydub import AudioSegment
import webrtcvad
import os
import threading

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progress_dict = {}  # Para armazenar progresso por arquivo

def remove_silence_and_restore(audio_path, output_path, file_id):
    print(f"[LOG] Processando arquivo: {audio_path}")

    # Carregar áudio original
    original_audio = AudioSegment.from_file(audio_path)
    orig_channels = original_audio.channels
    orig_frame_rate = original_audio.frame_rate
    orig_sample_width = original_audio.sample_width

    # Normalizar para mono 16-bit PCM 16kHz para VAD
    audio = original_audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)
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
        progress_dict[file_id] = min(100, int((i / (frame_size // audio.frame_width)) / total_frames * 100))

    # Aumenta volume do áudio final
    new_audio += 6  # +6dB, ajuste se necessário

    # Desnormalizar: restaurar canais, taxa e sample width originais
    new_audio = new_audio.set_channels(orig_channels)
    new_audio = new_audio.set_frame_rate(orig_frame_rate)
    new_audio = new_audio.set_sample_width(orig_sample_width)

    # Exportar como MP3
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

    # Processar em thread
    thread = threading.Thread(target=remove_silence_and_restore, args=(filepath, output_path, file_id))
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
