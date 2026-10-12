-- =====================================================================
-- Demo thao tác cơ sở dữ liệu trong pgAdmin (https://localhost/pgadmin/)
-- Kết nối: máy chủ "Booking PostgreSQL", database booking, user booking_app
--
-- Cách chạy: bôi đen MỘT câu lệnh rồi bấm ▶ (hoặc F5).
-- Không chạy cả tệp một lần: phần 3 cố ý gây lỗi để chứng minh các lớp bảo vệ,
-- và khi chạy cả tệp, một lỗi làm hủy (rollback) mọi câu chạy cùng lượt.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. XEM DỮ LIỆU
-- ---------------------------------------------------------------------

-- 1.1 Danh sách dịch vụ
SELECT name, duration_min, price_vnd, active
FROM app.services
ORDER BY name;

-- 1.2 Danh sách lịch hẹn kèm khách hàng, dịch vụ, nhân viên
SELECT 'LH' || a.ref_no AS ma_lich,
       c.full_name      AS khach_hang,
       c.phone,
       s.name           AS dich_vu,
       st.full_name     AS nhan_vien,
       a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS bat_dau,
       a.status
FROM app.appointments a
JOIN app.customers c ON c.id = a.customer_id
JOIN app.services  s ON s.id = a.service_id
JOIN app.staff    st ON st.id = a.staff_id
ORDER BY a.start_at;

-- 1.3 Thống kê số lịch theo trạng thái
SELECT status AS trang_thai, count(*) AS so_lich
FROM app.appointments
GROUP BY status
ORDER BY so_lich DESC;


-- ---------------------------------------------------------------------
-- 2. THÊM / SỬA / XÓA (trên một dịch vụ thử, cuối cùng xóa đi)
--    pgAdmin mặc định auto-commit: chạy xong là đã ghi vào cơ sở dữ liệu.
-- ---------------------------------------------------------------------

-- 2.1 Thêm dịch vụ thử -> tải lại https://localhost sẽ thấy dịch vụ mới
INSERT INTO app.services (name, description, duration_min, price_vnd)
VALUES ('Dịch vụ thử (pgAdmin)', 'Tạo để thử, xóa ở bước 2.3', 30, 99000)
RETURNING name, duration_min, price_vnd, active;

-- 2.2 Sửa giá
UPDATE app.services
SET price_vnd = 120000
WHERE name = 'Dịch vụ thử (pgAdmin)'
RETURNING name, price_vnd;

-- 2.3 Xóa, dữ liệu trở lại như cũ
DELETE FROM app.services
WHERE name = 'Dịch vụ thử (pgAdmin)'
RETURNING name;


-- ---------------------------------------------------------------------
-- 3. KIỂM CHỨNG CÁC LỚP BẢO VỆ (hai câu dưới phải BÁO LỖI, xem tab Messages)
-- ---------------------------------------------------------------------

-- 3.1 Đặt trùng giờ: thêm lịch cho cùng nhân viên, cùng giờ với LH1005.
--     Mong đợi: conflicting key value violates exclusion constraint "no_overlap_per_staff"
--     (ghi rõ ref_no để lệnh thất bại không làm nhảy số thứ tự mã lịch)
INSERT INTO app.appointments (ref_no, lookup_code, customer_id, service_id, staff_id,
       start_at, end_at, blocked_until, duration_min, price_vnd, status, source)
SELECT 99999, 'DEMOTRUNG', customer_id, service_id, staff_id,
       start_at, end_at, blocked_until, duration_min, price_vnd, 'confirmed', 'admin'
FROM app.appointments
WHERE ref_no = 1005;

-- 3.2 Vượt quyền: user booking_app không được tạo user/role.
--     Mong đợi: permission denied to create role
CREATE ROLE hacker WITH SUPERUSER LOGIN PASSWORD 'abc';


-- ---------------------------------------------------------------------
-- 4. THEO DÕI HOẠT ĐỘNG
-- ---------------------------------------------------------------------

-- 4.1 Các kết nối đang mở tới database booking (backend, worker, pgAdmin, exporter).
--     Dòng của user khác (exporter) hiện <insufficient privilege>: booking_app không
--     được xem câu lệnh của user khác, đó cũng là một biểu hiện của hạn chế quyền.
SELECT application_name, usename, state, query_start,
       left(regexp_replace(query, '\s+', ' ', 'g'), 60) AS cau_lenh
FROM pg_stat_activity
WHERE datname = 'booking'
ORDER BY application_name;

-- 4.2 Định nghĩa ràng buộc chống đặt trùng
SELECT conname, pg_get_constraintdef(oid) AS dinh_nghia
FROM pg_constraint
WHERE conname = 'no_overlap_per_staff';
