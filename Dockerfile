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
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# --ignore-scripts evita o postinstall do Prisma (não é usado em runtime).
RUN npm ci --omit=dev --ignore-scripts
COPY server/ ./
# Frontend compilado onde o server o procura por defeito (../../client/dist).
COPY --from=client /app/client/dist /app/client/dist

# O Railway injeta PORT; o server já o lê (fallback 3001).
EXPOSE 3001
CMD ["npm", "start"]
