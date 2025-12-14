# Usar imagem oficial do Python
FROM python:3.12-slim

# Atualizar apt e instalar compiladores e dependências
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos
COPY . /app

# Instalar dependências Python
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Criar pasta de uploads
RUN mkdir uploads

# Expor porta
EXPOSE 5000

# Rodar app
CMD ["python", "app.py"]
