# 차큐 API — 저장소 루트에서 빌드:  docker build -f server/Dockerfile -t chaq-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 \
    VEHICLE_MASTER_PATH=/app/site-data/vehicle-master.js \
    SEED_QUOTES_PATH=/app/site-data/quotes.js
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package.json ./
COPY server/migrations ./migrations
COPY server/admin ./admin
# 차량 데이터(트림 연결·검색용)와 첫 이전용 견적 데이터 — 사이트 저장소의 파일을 그대로 사용
COPY pages/data/vehicle-master.js pages/data/quotes.js ./site-data/
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
