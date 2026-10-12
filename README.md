# Hệ thống đặt lịch hẹn – An Nhiên Studio

Website đặt lịch hẹn (dịch vụ, khung giờ, khách hàng, xác nhận) triển khai bằng **Docker Compose**: React + NestJS + PostgreSQL + pgAdmin, đứng sau **Nginx reverse proxy** có HTTPS tự ký và security headers, giám sát bằng **Prometheus + Grafana**, log tập trung bằng **Loki + Promtail**.

> Đề 40 – Học phần Triển khai và Quản trị Hệ thống Phần mềm.
> **Commit 1**: ứng dụng, cơ sở dữ liệu, pgAdmin, Nginx HTTPS, hardening. **Commit 2**: giám sát Prometheus + Grafana. **Commit 3**: log tập trung Loki + Promtail, truy vấn LogQL.

## Kiến trúc

```mermaid
flowchart LR
  user([Trình duyệt]) -- "80 → 301 HTTPS<br/>443 HTTPS" --> nginx

  subgraph edge [mạng edge]
    nginx[Nginx<br/>frontend tĩnh + reverse proxy]
  end

  subgraph app [mạng app · internal]
    backend[Backend NestJS<br/>/api]
    worker[Worker<br/>hết hạn lịch, email]
    pg[(PostgreSQL 17)]
    pgadmin[pgAdmin 4]
  end

  subgraph monitor [mạng monitor · internal]
    prometheus[Prometheus]
    grafana[Grafana]
    cadvisor[cAdvisor]
    nginxexp[nginx-exporter]
    pgexp[postgres-exporter]
    loki[(Loki)]
    promtail[Promtail]
  end

  nginx -- "/api/" --> backend
  nginx -- "/pgadmin/" --> pgadmin
  nginx -- "/grafana/" --> grafana
  nginx -- "/prometheus/<br/>basic auth" --> prometheus
  backend --> pg
  worker --> pg
  pgadmin --> pg
  worker -. "mạng egress (SMTP)" .-> smtp[(Máy chủ email)]

  grafana --> prometheus
  prometheus -- "/metrics" --> backend
  prometheus --> cadvisor
  prometheus --> nginxexp
  prometheus --> pgexp
  nginxexp -- "stub_status :8081" --> nginx
  pgexp -- "user exporter" --> pg
  promtail -- "đẩy log" --> loki
  grafana -- "LogQL" --> loki
  logs[/"Tệp log json-file<br/>của mọi container"/] -. "đọc read-only" .-> promtail
```

- Chỉ **Nginx** publish cổng (80, 443). PostgreSQL, pgAdmin, backend nằm trong mạng `app` (internal); Prometheus, Grafana, các exporter, Loki và Promtail nằm trong mạng `monitor` (internal). Không dịch vụ nào khác truy cập trực tiếp được từ máy chủ.
- Frontend được build thành tệp tĩnh và đóng gói cùng image Nginx.
- Chống đặt trùng bằng **exclusion constraint** của PostgreSQL (`btree_gist` + `tstzrange`): hai lịch cùng nhân viên không thể chồng giờ kể cả khi gửi đồng thời.

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend, worker | Node.js 22, NestJS 11, `pg` (SQL migration thuần) |
| Cơ sở dữ liệu | PostgreSQL 17 + pgAdmin 4 |
| Reverse proxy | Nginx 1.28 (image `nginx-unprivileged`) |
| Giám sát | Prometheus 3.13, Grafana 13.2, cAdvisor 0.55, nginx-prometheus-exporter 1.5, postgres_exporter 0.20, `prom-client` trong backend |
| Log tập trung | Loki 3.6, Promtail 3.6, log JSON một dòng từ Nginx, backend, worker, Grafana |
| Triển khai | Docker Compose |

## Yêu cầu

- Docker Desktop (Windows/macOS) hoặc Docker Engine + Docker Compose v2 (Linux), tối thiểu 4 GB RAM (12 container dùng khoảng 0,85 GB khi chạy; image tải về khoảng 4,5 GB đĩa).
- `openssl` và `bash` để chạy script (Windows: dùng **Git Bash** đi kèm Git for Windows).
- Cổng 80 và 443 trên máy còn trống.

## Chạy hệ thống

```bash
git clone https://github.com/VPhuong06/DTC245200722.git && cd DTC245200722
./scripts/gen-env.sh          # tạo .env với mật khẩu ngẫu nhiên mạnh (hoặc: cp .env.example .env rồi sửa mọi CHANGE_ME)
./scripts/gen-cert.sh         # sinh chứng chỉ HTTPS tự ký vào nginx/certs/
./scripts/gen-htpasswd.sh     # tạo mật khẩu basic auth cho trang Prometheus vào nginx/auth/
docker compose up -d --build
docker compose ps             # mọi dịch vụ ở trạng thái running / healthy
```

Mở `https://localhost`. Trình duyệt sẽ cảnh báo vì chứng chỉ tự ký: chọn *Nâng cao → Tiếp tục*.

Dừng hệ thống: `docker compose down` (giữ dữ liệu) hoặc `docker compose down -v` (xóa cả volume dữ liệu).

### Địa chỉ truy cập

| Dịch vụ | Địa chỉ |
| --- | --- |
| Website đặt lịch (khách) | `https://localhost` |
| Tra cứu, đổi, hủy lịch (khách) | `https://localhost/tra-cuu` |
| Trang quản trị | `https://localhost/quan-tri` |
| API | `https://localhost/api/v1` |
| Tài liệu API (Swagger/OpenAPI) | `https://localhost/api/docs` |
| pgAdmin | `https://localhost/pgadmin/` |
| Grafana (dashboard giám sát, xem và truy vấn log) | `https://localhost/grafana/` |
| Prometheus (targets, alerts, truy vấn PromQL) | `https://localhost/prometheus/` |

### Tài khoản demo

Mọi mật khẩu nằm trong tệp `.env` (không commit):

| Ứng dụng | Tài khoản | Mật khẩu |
| --- | --- | --- |
| Trang quản trị | `ADMIN_EMAIL` | `ADMIN_PASSWORD` |
| pgAdmin | `PGADMIN_DEFAULT_EMAIL` | `PGADMIN_DEFAULT_PASSWORD` |
| Kết nối PostgreSQL trong pgAdmin (khai báo sẵn "Booking PostgreSQL") | `booking_app` | `APP_DB_PASSWORD` |
| Grafana | `GRAFANA_ADMIN_USER` | `GRAFANA_ADMIN_PASSWORD` |
| Prometheus (Nginx basic auth) | `PROMETHEUS_WEB_USER` | `PROMETHEUS_WEB_PASSWORD` |

Khi `SEED_DEMO=true` và cơ sở dữ liệu còn trống, hệ thống nạp dữ liệu mẫu: 4 dịch vụ, 3 nhân viên (làm Thứ Hai – Thứ Bảy, 09:00–17:00) và 15 lịch hẹn quanh ngày hiện tại.

## Chức năng

**Khách (không cần đăng nhập):** chọn dịch vụ, nhân viên hoặc "Nhân viên bất kỳ", chọn ngày và giờ còn trống, nhập thông tin và đồng ý chính sách quyền riêng tư, nhận **mã lịch** (LH…) và **mã tra cứu**. Tra cứu bằng mã tra cứu + số điện thoại để tự đổi hoặc hủy lịch trước hạn.

**Quản trị viên:** xem lịch theo **danh sách / ngày / tuần**, tìm kiếm và lọc theo dịch vụ, nhân viên, trạng thái; tạo lịch hộ khách gọi điện; xác nhận, đổi, hủy (kèm lý do), đánh dấu hoàn thành hoặc khách không đến; xem lịch sử thao tác. Quản lý dịch vụ, nhân viên và giờ làm, ngày nghỉ, nghỉ phép, chính sách đặt lịch, khách hàng.

**Vòng đời lịch:** Chờ xác nhận → Đã xác nhận → Hoàn thành / Không đến. Lịch chờ hoặc đã xác nhận có thể bị hủy; lịch chờ quá thời gian giữ chỗ tự chuyển sang Hết hạn (worker). Chỉ lịch Chờ xác nhận và Đã xác nhận chiếm giờ của nhân viên.

**Quy tắc chống đặt trùng:**

- Frontend chỉ hiển thị giờ trống; backend kiểm tra lại toàn bộ (giờ làm, thời lượng + thời gian chuẩn bị, ngày nghỉ, đặt trước tối thiểu/tối đa).
- Ràng buộc `no_overlap_per_staff` trong PostgreSQL là chốt chặn cuối; vi phạm → API trả `409 Conflict` với thông báo như "Minh Lan đã có lịch 15:00–16:00. Chọn giờ hoặc nhân viên khác."
- Tạo lịch bắt buộc header `Idempotency-Key`: gửi lại cùng key trả lại kết quả cũ, không tạo lịch mới.
- Đổi lịch chạy trong một giao dịch; thất bại thì lịch cũ giữ nguyên.

Lỗi API luôn có dạng `{ "error": { "code", "message", "request_id" } }`.

## Giám sát (Prometheus + Grafana)

Prometheus thu thập metrics 15 giây/lần từ các nguồn trong mạng nội bộ; Grafana tự nạp sẵn nguồn dữ liệu và 4 dashboard khi khởi động (thư mục **Đặt lịch hẹn**): 3 dashboard giám sát dưới đây và dashboard log ở phần sau.

| Nguồn (job) | Thu thập bằng | Giám sát |
| --- | --- | --- |
| `cadvisor` | cAdvisor | CPU, RAM (so với giới hạn), mạng của **từng container** |
| `nginx` | nginx-prometheus-exporter đọc `stub_status` (cổng nội bộ 8081) | **Web server**: kết nối, request/giây |
| `backend` | `prom-client` tại `GET /metrics` của backend | **API**: request theo route và mã trạng thái, độ trễ p50/p95/p99, lịch hẹn trong ngày, bộ nhớ Node.js |
| `postgres` | postgres_exporter, user `exporter` chỉ có quyền `pg_monitor` | **Database**: kết nối, giao dịch/giây, cache hit, dung lượng, lock, deadlock |
| `loki`, `promtail` | chính Loki, Promtail | Hệ thống log tập trung (commit 3) |
| `prometheus` | chính Prometheus | Tình trạng Prometheus |

| Dashboard | Nội dung chính |
| --- | --- |
| **Container (cAdvisor)** | Số container đang chạy, bảng trạng thái các target (`up`), CPU/RAM/mạng theo container, RAM so với giới hạn |
| **Web server & API** | Nginx up, kết nối, request/giây; backend: request theo mã trạng thái, độ trễ, tỉ lệ lỗi 5xx, route gọi nhiều nhất, lịch hẹn tạo mới trong 24 giờ, số lần đặt trùng bị chặn (409), lịch hôm nay theo trạng thái |
| **PostgreSQL** | pg_up, dung lượng, kết nối theo trạng thái, commit/rollback mỗi giây, cache hit, số dòng đọc/ghi, lock theo loại, deadlock |

Luật cảnh báo trong `monitoring/prometheus/alerts.yml` (xem tại `https://localhost/prometheus/alerts`): `TargetDown`, `PostgresDown`, `NginxDown`, `BackendHighErrorRate` (> 5% lỗi 5xx), `BackendSlowResponses` (p95 > 1 giây), `ContainerMemoryNearLimit` (> 90% giới hạn RAM).

Một số ghi chú thiết kế:

- Nhãn `route` của metrics HTTP là **mẫu đường dẫn** (`/api/v1/admin/appointments/:id/confirm`), không phải đường dẫn thật, để mã lịch và UUID không làm bùng nổ số chuỗi metrics.
- "Lịch hẹn tạo mới (24 giờ)" đếm trực tiếp trong cơ sở dữ liệu. Không dùng `increase()` trên counter HTTP vì hàm này ngoại suy nên không ra số nguyên chính xác, và một request gửi lại cùng `Idempotency-Key` vẫn trả 201 dù không tạo lịch mới.
- `/metrics` của backend nằm ngoài tiền tố `/api/v1`, Nginx không chuyển tiếp nên không truy cập được từ bên ngoài.

Kiểm chứng nhanh (Git Bash, sau khi `source .env` hoặc thay giá trị trực tiếp):

```bash
# Prometheus chặn khi không có mật khẩu
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/prometheus/        # 401
# Tất cả target đang up
curl -sk -u "$PROMETHEUS_WEB_USER:$PROMETHEUS_WEB_PASSWORD" https://localhost/prometheus/api/v1/targets \
  | grep -o '"health":"[a-z]*"' | sort | uniq -c                               # 7 "health":"up"
```

## Log tập trung (Loki + Promtail)

Mọi container ghi log ra stdout/stderr; Docker lưu thành tệp `json-file` (xoay vòng 3 tệp × 10 MB). **Promtail** đọc các tệp này ở chế độ read-only, gắn nhãn rồi đẩy sang **Loki** (lưu 7 ngày). Xem và truy vấn log trong Grafana: dashboard **Nhật ký tập trung (Loki)** hoặc *Explore* → nguồn dữ liệu *Loki*.

- Promtail **không gắn `docker.sock`** (socket Docker dù read-only vẫn cho toàn quyền điều khiển Docker). Tên dịch vụ lấy từ trường `attrs` mà log driver ghi kèm mỗi dòng (`logging.options.labels` trong `docker-compose.yml`).
- Nhãn (label) chỉ gồm các giá trị ít thay đổi: `service` (nginx, backend, postgres…), `level` (debug/info/warn/error/fatal, chuẩn hóa từ JSON, logfmt, log PostgreSQL và Nginx), `stream` (stdout/stderr). Các trường nhiều giá trị như `status`, `uri`, `request_id` không làm nhãn mà tách lúc truy vấn bằng `| json`.
- Nginx và backend ghi chung `request_id` (Nginx sinh, chuyển cho backend qua `X-Request-ID`, trả về trong mọi lỗi API), nên có thể lần theo một request qua cả hai.
- Log không chứa số điện thoại, email hay query string (Nginx ghi `$uri` thay cho `$request_uri`, backend không ghi body).

Truy vấn LogQL (dán vào *Explore* → *Loki*, chế độ *Code*):

| Mục đích | LogQL |
| --- | --- |
| Lỗi và cảnh báo của mọi dịch vụ | `{level=~"error\|warn"}` |
| Request trả lỗi 4xx/5xx qua Nginx | `{service="nginx"} \| json \| status >= 400` |
| Đếm request theo mã trạng thái (1 giờ) | `sum by (status) (count_over_time({service="nginx"} \| json \| __error__="" [1h]))` |
| Đặt lịch bị từ chối vì trùng giờ (409) | `{service="backend"} \| json \| msg="http_request" \| status="409"` |
| Exclusion constraint của PostgreSQL chặn đặt trùng | `{service="postgres"} \|= "no_overlap_per_staff"` |
| Độ trễ p95 của backend tính từ log | `quantile_over_time(0.95, {service="backend"} \| json \| msg="http_request" \| unwrap duration_ms [1h]) by (service)` |
| Lần theo một request qua Nginx và backend | `{service=~"nginx\|backend"} \| json \| request_id="<request_id trong phản hồi lỗi>"` |
| 5 đường dẫn được gọi nhiều nhất (1 giờ) | `topk(5, sum by (uri) (count_over_time({service="nginx"} \| json \| __error__="" [1h])))` |

`| __error__=""` bỏ các dòng không phải JSON (ví dụ error log dạng chữ của Nginx); thiếu bộ lọc này, truy vấn dạng metric sẽ báo lỗi `JSONParserErr`.

Dashboard **Nhật ký tập trung (Loki)** có: số dòng log lỗi/cảnh báo, số request Nginx 4xx/5xx và số lần đặt trùng bị chặn trong 1 giờ; khối lượng log theo dịch vụ và theo mức; request Nginx theo mã trạng thái; độ trễ backend p50/p95 tính từ log; đường dẫn lỗi nhiều nhất; khung xem log lỗi, log 409 và ô nhập `request_id` để lần theo một request.

## Hardening

| Biện pháp | Cách làm | Lệnh kiểm chứng |
| --- | --- | --- |
| Container non-root | Backend/worker chạy `USER node`; Nginx dùng `nginxinc/nginx-unprivileged` (cổng 8080/8443 bên trong); pgAdmin chạy bằng uid 5050; Prometheus, postgres_exporter chạy bằng `nobody`, Grafana bằng uid 472, nginx-exporter bằng uid 1001, Loki bằng uid 10001. Ngoại lệ: cAdvisor (đọc cgroup của máy chủ) và Promtail (đọc tệp log của Docker, chỉ root có quyền) chạy bằng root, bù lại bỏ mọi capability và gắn mọi thư mục ở chế độ read-only | `docker compose exec backend id` → `uid=1000(node)` |
| Tách mạng | `edge`: chỉ Nginx publish 80/443. `app` (internal): backend, worker, PostgreSQL, pgAdmin. `monitor` (internal): Prometheus, Grafana, cAdvisor, exporter, Loki, Promtail. `egress`: chỉ worker (gửi email). PostgreSQL, Prometheus, Grafana, Loki không publish cổng; Loki không đi qua Nginx | `docker network inspect booking_app`; `Test-NetConnection localhost -Port 5432` (Windows) hoặc `nc -zv localhost 5432` → thất bại |
| Mật khẩu mạnh, bí mật | pgAdmin tắt Gravatar (không gửi mã băm email quản trị ra ngoài) và kiểm tra phiên bản qua Internet; `scripts/gen-env.sh` sinh mật khẩu ngẫu nhiên 24 ký tự (JWT 48 ký tự); trang Prometheus có basic auth, mật khẩu băm SHA-512 crypt; `.env`, khóa riêng TLS và `nginx/auth/htpasswd` nằm trong `.gitignore` | `git log --all -- .env` không có kết quả |
| Hạn chế quyền DB | `booking_app` không SUPERUSER, chỉ sở hữu schema `app`; `exporter` chỉ có `pg_monitor`; thu hồi quyền mặc định của PUBLIC | `docker compose exec postgres psql -U postgres -d booking -c '\du'` |
| Giới hạn quyền container | `no-new-privileges` cho mọi dịch vụ; `cap_drop: [ALL]`, `read_only: true` (+ `tmpfs` khi cần) cho Nginx, backend, worker và mọi dịch vụ giám sát; PostgreSQL chỉ giữ 5 capability cần cho entrypoint; pgAdmin chỉ giữ `NET_BIND_SERVICE` (tệp python của image có file capability này); giới hạn CPU/RAM từng dịch vụ | `docker inspect booking-backend-1 --format '{{.HostConfig.CapDrop}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.SecurityOpt}}'` |
| Security headers, HTTPS | TLS 1.2/1.3, HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; `server_tokens off`; HTTP 80 → 301 HTTPS | `curl -kI https://localhost`; `curl -I http://localhost` |
| Giới hạn tốc độ | Nginx `limit_req` cho `/api/` (20 req/s) và đăng nhập (5 req/phút) trả 429; ứng dụng giới hạn thêm đăng nhập, tra cứu, đặt lịch; khóa tài khoản 15 phút sau 5 lần sai | Xem lệnh bên dưới |
| Ứng dụng | Mật khẩu băm bcrypt; cookie phiên `HttpOnly`, `Secure`, `SameSite=Strict`; chống CSRF bằng header bắt buộc; kiểm tra quyền trên mọi API quản trị; mã tra cứu ngẫu nhiên và luôn cần kèm số điện thoại; log không ghi số điện thoại, email, query string | `curl -k https://localhost/api/v1/admin/appointments?from=2026-01-01&to=2026-01-01` → 401 |
| Log | Xoay vòng log mọi container (3 × 10 MB); Promtail không gắn `docker.sock`; Loki lưu 7 ngày, không publish cổng | `docker inspect booking-backend-1 --format '{{json .HostConfig.LogConfig}}'` |
| Image cố định phiên bản | `node:22.22-alpine`, `nginxinc/nginx-unprivileged:1.28-alpine`, `postgres:17.6-alpine`, `dpage/pgadmin4:9.8`, `prom/prometheus:v3.13.4`, `grafana/grafana:13.2.3`, `gcr.io/cadvisor/cadvisor:v0.55.1`, `nginx/nginx-prometheus-exporter:1.5.3`, `prometheuscommunity/postgres-exporter:v0.20.1`, `grafana/loki:3.6.17`, `grafana/promtail:3.6.11` (không dùng `latest`) | `docker compose config --images` |

Thử giới hạn tốc độ đăng nhập (Git Bash):

```bash
for i in $(seq 1 12); do curl -sk -o /dev/null -w "%{http_code} " -X POST https://localhost/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"x@annhien.vn","password":"sai"}'; done; echo
# Kết quả: vài mã 401 rồi 429
```

## Ảnh minh chứng

Ảnh chụp từ hệ thống đang chạy thật (`docs/images/`), sắp theo tiêu chí đánh giá của đề. Ảnh kết quả lệnh giữ nguyên văn đầu ra, chỉ tô màu dòng lệnh và chú thích.

### Ứng dụng và cơ sở dữ liệu

| | |
| --- | --- |
| ![Chọn dịch vụ](docs/images/01-dat-lich-chon-dich-vu.png) Khách chọn dịch vụ, nhân viên | ![Chọn giờ](docs/images/02-dat-lich-chon-gio.png) Chỉ hiển thị giờ còn trống |
| ![Đặt lịch thành công](docs/images/03-dat-lich-thanh-cong.png) Nhận mã lịch và mã tra cứu | ![Tra cứu](docs/images/04-tra-cuu-lich.png) Tra cứu bằng mã + số điện thoại, tự đổi/hủy |
| ![Quản trị danh sách](docs/images/05-quan-tri-danh-sach.png) Quản trị: danh sách, lọc, chi tiết | ![Quản trị lịch tuần](docs/images/06-quan-tri-lich-tuan.png) Quản trị: lịch theo tuần |
| ![pgAdmin](docs/images/07-pgadmin-bang-du-lieu.png) pgAdmin kết nối bằng `booking_app`, 15 bảng của schema `app` | ![pgAdmin Query Tool](docs/images/07b-pgadmin-query-tool.png) Truy vấn dữ liệu trong pgAdmin |
| ![Swagger](docs/images/08-swagger-api.png) Tài liệu API (OpenAPI) | ![docker compose ps](docs/images/21-docker-compose-ps.png) 12 dịch vụ chạy bằng Docker Compose |

### Nginx reverse proxy, HTTPS

![HTTPS và security headers](docs/images/22-https-security-headers.png)

### Giám sát Prometheus + Grafana

| | |
| --- | --- |
| ![Prometheus targets](docs/images/09-prometheus-targets.png) 7 target đều UP | ![Prometheus alerts](docs/images/10-prometheus-alerts.png) 6 luật cảnh báo |
| ![PromQL](docs/images/11-prometheus-promql.png) Truy vấn PromQL: request backend theo mã trạng thái | ![Grafana Container](docs/images/12-grafana-container.png) Dashboard Container (cAdvisor) |
| ![Grafana Web & API](docs/images/13-grafana-web-api.png) Dashboard Web server & API | ![Grafana PostgreSQL](docs/images/14-grafana-postgres.png) Dashboard PostgreSQL |

### Log tập trung Loki + LogQL

| | |
| --- | --- |
| ![Dashboard log](docs/images/15-grafana-logs.png) Dashboard Nhật ký tập trung (Loki) | ![Lần theo request](docs/images/16-logql-lan-theo-request.png) Lần theo một `request_id` qua Nginx và backend |
| ![Nginx lỗi](docs/images/17-logql-nginx-loi.png) `{service="nginx"} \| json \| status >= 400` | ![409](docs/images/18-logql-dat-trung-409.png) Đặt trùng giờ bị từ chối (409) |
| ![Constraint](docs/images/19-logql-postgres-constraint.png) PostgreSQL chặn đặt trùng bằng exclusion constraint | ![Đếm theo status](docs/images/20-logql-dem-theo-status.png) Đếm request Nginx theo mã trạng thái |

### Hardening

| | |
| --- | --- |
| ![Hardening container](docs/images/23-hardening-container.png) User, read-only, capability, giới hạn RAM | ![Tách mạng](docs/images/24-tach-mang.png) Bốn mạng, chỉ Nginx publish cổng |
| ![Quyền DB](docs/images/25-phan-quyen-db.png) User DB không phải superuser | ![Kiểm soát truy cập](docs/images/26-kiem-soat-truy-cap.png) Rate limit 429, 401 khi chưa đăng nhập, basic auth, cổng nội bộ không truy cập được |
| ![Image](docs/images/27-image-ghim-phien-ban.png) Image ghim phiên bản | ![Log](docs/images/28-log-json-xoay-vong.png) Log JSON xoay vòng, không ghi email/mật khẩu |

## Kiểm thử

```bash
# Unit test: tính giờ trống, metrics HTTP (backend, 10 test); định dạng thời gian (frontend, 3 test)
cd backend && npm ci && npm test
cd frontend && npm ci && npm test

# Kiểm thử API trên hệ thống đang chạy (38 kiểm tra): đặt lịch, trùng giờ, idempotency,
# 10 yêu cầu đặt cùng lúc chỉ 1 thành công, tra cứu, phân quyền, CSRF.
# Đặt RATE_LIMIT_MULTIPLIER=10 trong .env rồi docker compose up -d trước khi chạy.
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.mjs
```

## Phát triển cục bộ (không dùng Docker)

Cần PostgreSQL có sẵn user/schema như `postgres/init/01-roles.sh`.

```bash
cd backend && npm ci && npm run build
DB_HOST=localhost DB_NAME=booking DB_USER=booking_app DB_PASSWORD=... \
JWT_SECRET=<chuỗi ≥ 32 ký tự> COOKIE_SECURE=false ADMIN_EMAIL=... ADMIN_PASSWORD=... node dist/main.js

cd frontend && npm ci && npm run dev   # http://localhost:5173, /api được proxy sang :3000
```

## Cấu trúc thư mục

```text
.
├── backend/                 # NestJS: API, worker, migration SQL, Dockerfile (non-root)
├── frontend/                # React + Vite; Dockerfile build tệp tĩnh vào image Nginx
├── nginx/
│   ├── nginx.conf           # log JSON, limit_req, server_tokens off
│   ├── conf.d/booking.conf  # 80→443, HTTPS, định tuyến /, /api/, /pgadmin/, /grafana/, /prometheus/, stub_status
│   ├── snippets/            # security headers, proxy tới backend
│   ├── certs/               # sinh bằng scripts/gen-cert.sh, không commit
│   └── auth/                # htpasswd của Prometheus, sinh bằng scripts/gen-htpasswd.sh, không commit
├── monitoring/
│   ├── prometheus/          # prometheus.yml (nguồn thu thập), alerts.yml (luật cảnh báo)
│   ├── grafana/             # provisioning (nguồn dữ liệu Prometheus + Loki) và 4 dashboard JSON
│   ├── loki/                # loki-config.yml (lưu trữ, giữ 7 ngày)
│   └── promtail/            # promtail-config.yml (đọc log json-file, gắn nhãn service/level)
├── postgres/init/           # tạo user ứng dụng và user exporter quyền hạn chế
├── pgadmin/servers.json     # khai báo sẵn kết nối PostgreSQL
├── scripts/                 # gen-env.sh, gen-cert.sh, gen-htpasswd.sh, smoke-test.mjs
├── docs/images/             # 29 ảnh minh chứng (xem mục "Ảnh minh chứng")
├── docker-compose.yml
└── .env.example             # mẫu biến môi trường, không chứa mật khẩu thật
```

## Ghi chú cho Windows

- Chạy các script `.sh` trong **Git Bash**. Repository dùng `.gitattributes` để giữ xuống dòng LF cho tệp chạy trong container.
- Nếu cổng 80/443 đã bị chiếm, đổi `HTTP_PORT`/`HTTPS_PORT` trong `.env`. Khi đổi cổng HTTPS, truy cập trực tiếp `https://localhost:<cổng>` (chuyển hướng từ HTTP luôn trỏ về cổng 443).
- Dùng Docker Engine trong WSL không có systemd: dockerd tự chạy containerd riêng ở `/run/docker/containerd/`, nên cAdvisor không thấy container (dashboard Container trống). Tạo liên kết tới đường dẫn chuẩn rồi khởi động lại cAdvisor: `mkdir -p /run/containerd && ln -s /run/docker/containerd/containerd.sock /run/containerd/containerd.sock && docker compose restart cadvisor`. Docker Desktop và Linux có systemd không cần bước này.
