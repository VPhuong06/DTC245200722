#!/usr/bin/env bash
# Sinh chứng chỉ HTTPS tự ký cho localhost (dùng cho Nginx).
#   ./scripts/gen-cert.sh            # tạo nếu chưa có
#   ./scripts/gen-cert.sh --force    # tạo lại
set -euo pipefail

# Git Bash trên Windows tự đổi "/C=VN/..." thành đường dẫn; tắt tính năng này.
# Vì vậy bên dưới chỉ dùng đường dẫn tương đối cho openssl.
export MSYS_NO_PATHCONV=1

DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"
mkdir -p "$DIR"
cd "$DIR"

if [[ -f server.crt && -f server.key && "${1:-}" != "--force" ]]; then
  echo "Chứng chỉ đã tồn tại trong nginx/certs (dùng --force để tạo lại)."
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout server.key -out server.crt \
  -subj "/C=VN/O=An Nhien Studio/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

# Nginx trong container chạy bằng uid 101 (không phải root) nên cần đọc được khóa.
# Thư mục certs/ không được commit (.gitignore).
chmod 644 server.crt server.key

echo "Đã tạo nginx/certs/server.crt và nginx/certs/server.key:"
openssl x509 -in server.crt -noout -subject -dates
