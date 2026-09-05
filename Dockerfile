FROM node:24-slim

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --registry=https://registry.npmmirror.com
COPY backend/ ./

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080
CMD ["node", "server.js"]
