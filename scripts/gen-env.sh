#!/usr/bin/env bash
# Tạo tệp .env từ .env.example, thay mọi giá trị CHANGE_ME bằng mật khẩu ngẫu nhiên mạnh.
#   ./scripts/gen-env.sh            # chỉ tạo nếu chưa có .env
#   ./scripts/gen-env.sh --force    # ghi đè .env hiện có
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.env.example"
DST="$ROOT/.env"

if [[ -f "$DST" && "${1:-}" != "--force" ]]; then
  echo ".env đã tồn tại, không ghi đè (dùng --force nếu muốn tạo lại)."
  exit 0
fi

# Chuỗi ngẫu nhiên chỉ gồm chữ và số để không phải thoát ký tự trong YAML/shell.
rand() {
  openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"
}

: > "$DST"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([A-Z_]+)=CHANGE_ME ]]; then
    name="${BASH_REMATCH[1]}"
    len=24
    [[ "$name" == "JWT_SECRET" ]] && len=48
    echo "${name}=$(rand "$len")" >> "$DST"
  else
    echo "$line" >> "$DST"
  fi
done < "$SRC"

chmod 600 "$DST"
echo "Đã tạo $DST với mật khẩu ngẫu nhiên."
echo "Tài khoản quản trị website và pgAdmin: xem ADMIN_EMAIL/ADMIN_PASSWORD, PGADMIN_DEFAULT_EMAIL/PGADMIN_DEFAULT_PASSWORD trong .env"
