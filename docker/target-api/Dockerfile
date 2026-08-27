FROM node:24.19.0-alpine

WORKDIR /app

COPY package.json package-lock.json server.js ./
RUN npm ci

EXPOSE 4000

CMD ["node", "server.js"]