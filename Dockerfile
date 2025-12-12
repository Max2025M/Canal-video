FROM node:18

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN apt-get update && apt-get install -y ffmpeg

EXPOSE 3000

CMD ["npm", "start"]
