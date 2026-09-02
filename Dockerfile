# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server ./server
RUN npx tsc -p tsconfig.json

# ---- runtime stage ----
FROM node:24-alpine
# util-linux 提供 nsenter（进宿主命名空间需要）；tini 处理 PID1
RUN apk add --no-cache util-linux tini
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8890
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/src/index.js"]