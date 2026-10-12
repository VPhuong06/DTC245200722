# syntax=docker/dockerfile:1

# ---- Build: biên dịch React + Vite thành tệp tĩnh ----
FROM node:22.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Nginx phục vụ tệp tĩnh và làm reverse proxy ----
# Image "unprivileged" chạy bằng user nginx (uid 101), lắng nghe cổng 8080/8443 bên trong container.
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080 8443
