# syntax=docker/dockerfile:1

# ---- Build: biên dịch TypeScript, sau đó bỏ devDependencies ----
FROM node:22.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime: chỉ chứa mã đã build, chạy bằng user không phải root ----
FROM node:22.22-alpine
ENV NODE_ENV=production
WORKDIR /app
# Mã nguồn thuộc root, user "node" chỉ đọc được, không sửa được.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
# Mặc định chạy API; dịch vụ worker ghi đè bằng "node dist/worker.js".
CMD ["node", "dist/main.js"]
