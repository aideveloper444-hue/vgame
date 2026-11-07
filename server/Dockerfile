# Royal Poker Club game server (also serves the web build and /admin).
# Build from the repo root:  docker build -f server/Dockerfile -t royal-poker-club .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build && npm run server:build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/rpc.sqlite WEB_DIST=/app/dist
COPY --from=build /app/server/dist/server.mjs ./server.mjs
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
