# ---- build: server ----
FROM node:24-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server ./server
RUN npx tsc -p tsconfig.json

# ---- build: web ----
FROM node:24-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- runtime ----
FROM node:24-alpine
# util-linux 提供 nsenter（进宿主命名空间）；tini 处理信号
RUN apk add --no-cache util-linux tini
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/dist ./dist
COPY --from=web-build /web/dist ./web
EXPOSE 8890
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/src/index.js"]
