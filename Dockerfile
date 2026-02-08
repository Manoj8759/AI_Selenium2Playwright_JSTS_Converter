# Build stage for React UI
FROM node:20-slim AS ui-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm install
COPY ui/ ./
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server.js ./
COPY --from=ui-builder /app/ui/dist ./ui/dist

# Expose the proxy port
EXPOSE 3001

# The application expects Ollama to be running on the host
# You might need to use --network="host" or point OLLAMA_URL to the host IP
ENV OLLAMA_URL=http://host.docker.internal:11434

CMD ["node", "server.js"]
