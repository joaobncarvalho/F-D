# F&D — imagem única: constrói o frontend e serve-o a partir do backend
# (Express + Socket.io). Mesma origem → sem CORS cruzado, um só serviço.
# Contexto de build = raiz do repo (vê server/ e client/).

# ---- 1) Build do frontend ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Opcional: para deploy do frontend à parte, passa --build-arg VITE_SERVER_URL=...
# Sem isto, o cliente liga-se à própria origem (o backend serve-o).
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

# ---- 2) Runtime do backend (serve API + frontend) ----
# Debian slim (não Alpine): o Prisma funciona sem os problemas de musl/OpenSSL
# (libssl.so.1.1) que dão "engines not compatible" no Alpine.
FROM node:20-slim AS runtime
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
# Inclui devDeps (prisma CLI) para gerar o client; --ignore-scripts para controlar
# o generate explicitamente a seguir (o postinstall do prisma não tem o schema ainda).
RUN npm ci --include=dev --ignore-scripts
COPY server/ ./
# @prisma/client é usado em runtime (repo.js) → tem de ser gerado no build (target Debian).
RUN npx prisma generate
# Frontend compilado onde o server o procura por defeito (../../client/dist).
COPY --from=client /app/client/dist /app/client/dist

ENV NODE_ENV=production
# O Railway injeta PORT; o server já o lê (fallback 3001).
EXPOSE 3001
CMD ["npm", "start"]
