# Usar imagem oficial Node.js com ffmpeg instalado
FROM node:20-bullseye

# Instalar ffmpeg e ffprobe
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos
COPY package*.json ./
RUN npm install
COPY . .

# Expor porta
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
