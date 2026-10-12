#!/usr/bin/env bash
# Tạo nginx/auth/htpasswd cho trang Prometheus (https://localhost/prometheus/) từ
# PROMETHEUS_WEB_USER / PROMETHEUS_WEB_PASSWORD trong .env. Mật khẩu băm SHA-512 crypt.
#   ./scripts/gen-htpasswd.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
OUT_DIR="$ROOT/nginx/auth"

[[ -f "$ENV_FILE" ]] || { echo "Chưa có .env, chạy ./scripts/gen-env.sh trước." >&2; exit 1; }

read_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
user="$(read_env PROMETHEUS_WEB_USER)"
pass="$(read_env PROMETHEUS_WEB_PASSWORD)"
[[ -n "$user" && -n "$pass" && "$pass" != "CHANGE_ME" ]] || {
  echo "Thiếu PROMETHEUS_WEB_USER hoặc PROMETHEUS_WEB_PASSWORD trong .env." >&2; exit 1; }

mkdir -p "$OUT_DIR"
printf '%s:%s\n' "$user" "$(openssl passwd -6 "$pass")" > "$OUT_DIR/htpasswd"
chmod 644 "$OUT_DIR/htpasswd"   # Nginx trong container chạy bằng user không phải root, cần đọc được
echo "Đã tạo nginx/auth/htpasswd cho user '$user'."
