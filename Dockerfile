FROM python:3.12-slim

# Atualizar apt e instalar compiladores, ffmpeg e dependências
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1-dev \
    ffmpeg \
    python3-setuptools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos
COPY . /app

# Atualizar pip e instalar dependências Python
RUN pip install --upgrade pip wheel setuptools
RUN pip install --no-cache-dir -r requirements.txt

# Criar pasta de uploads
RUN mkdir uploads

EXPOSE 5000

CMD ["python", "app.py"]
