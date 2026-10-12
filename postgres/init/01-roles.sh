#!/bin/sh
# Chạy một lần khi khởi tạo volume PostgreSQL (docker-entrypoint-initdb.d), bằng quyền superuser.
# Tạo user ứng dụng chỉ có quyền trên schema "app" và user "exporter" chỉ có quyền pg_monitor.
set -e  # không dùng -u: tệp này có thể được "source" bởi docker-entrypoint.sh

: "${APP_DB_USER:?Thiếu APP_DB_USER}"
: "${APP_DB_PASSWORD:?Thiếu APP_DB_PASSWORD}"
: "${EXPORTER_DB_PASSWORD:?Thiếu EXPORTER_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db_name="$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" \
  -v app_password="$APP_DB_PASSWORD" \
  -v exporter_password="$EXPORTER_DB_PASSWORD" <<'EOSQL'
-- Không ai được kết nối hay tạo đối tượng trong schema public trừ khi được cấp quyền.
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Extension cho exclusion constraint chống chồng lịch (cần superuser để tạo).
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

-- User ứng dụng: không SUPERUSER, không tạo database/role; chỉ sở hữu schema "app".
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 30;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
CREATE SCHEMA app AUTHORIZATION :"app_user";
ALTER ROLE :"app_user" SET search_path = app, public;

-- User cho postgres_exporter (commit 2): chỉ đọc số liệu giám sát.
CREATE ROLE exporter WITH LOGIN PASSWORD :'exporter_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3;
GRANT pg_monitor TO exporter;
GRANT CONNECT ON DATABASE :"db_name" TO exporter;
EOSQL

echo "Đã tạo user $APP_DB_USER (schema app) và exporter (pg_monitor)."
