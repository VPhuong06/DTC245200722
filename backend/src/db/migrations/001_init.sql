-- Khởi tạo lược đồ hệ thống đặt lịch hẹn.
-- Tất cả thời điểm lưu bằng timestamptz; hiển thị theo Asia/Ho_Chi_Minh.
-- Extension btree_gist được tạo sẵn bởi postgres/init (cần quyền superuser).

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  full_name         text NOT NULL,
  role              text NOT NULL CHECK (role IN ('admin', 'staff')),
  staff_id          uuid,
  failed_logins     int  NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  phone       text NOT NULL UNIQUE,
  email       text,
  consent_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  duration_min  int  NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  buffer_min    int  NOT NULL DEFAULT 0 CHECK (buffer_min BETWEEN 0 AND 120),
  price_vnd     int  NOT NULL DEFAULT 0 CHECK (price_vnd >= 0),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  title       text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD CONSTRAINT users_staff_fk FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE SET NULL;

CREATE TABLE staff_services (
  staff_id    uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- weekday: 0 = Chủ nhật ... 6 = Thứ bảy
CREATE TABLE working_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  CHECK (start_time < end_time)
);
CREATE INDEX working_hours_staff_idx ON working_hours (staff_id, weekday);

CREATE TABLE time_off (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  start_at  timestamptz NOT NULL,
  end_at    timestamptz NOT NULL,
  reason    text NOT NULL DEFAULT '',
  CHECK (start_at < end_at)
);
CREATE INDEX time_off_staff_idx ON time_off (staff_id, start_at);

CREATE TABLE holidays (
  day   date PRIMARY KEY,
  name  text NOT NULL
);

-- Chính sách đặt lịch: luôn chỉ có một dòng (id = 1).
CREATE TABLE booking_policies (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slot_step_min         int NOT NULL DEFAULT 30 CHECK (slot_step_min BETWEEN 5 AND 120),
  min_advance_min       int NOT NULL DEFAULT 120 CHECK (min_advance_min >= 0),
  max_advance_days      int NOT NULL DEFAULT 30 CHECK (max_advance_days BETWEEN 1 AND 365),
  hold_min              int NOT NULL DEFAULT 120 CHECK (hold_min BETWEEN 5 AND 10080),
  auto_confirm          boolean NOT NULL DEFAULT false,
  change_deadline_min   int NOT NULL DEFAULT 240 CHECK (change_deadline_min >= 0),
  reminder_offsets_min  int[] NOT NULL DEFAULT '{1440,120}',
  updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO booking_policies (id) VALUES (1);

CREATE SEQUENCE appointment_ref_seq START 1001;

CREATE TABLE appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no           int  NOT NULL UNIQUE DEFAULT nextval('appointment_ref_seq'),
  lookup_code      text NOT NULL UNIQUE,
  customer_id      uuid NOT NULL REFERENCES customers (id),
  service_id       uuid NOT NULL REFERENCES services (id),
  staff_id         uuid NOT NULL REFERENCES staff (id),
  start_at         timestamptz NOT NULL,
  end_at           timestamptz NOT NULL,
  blocked_until    timestamptz NOT NULL,
  duration_min     int  NOT NULL,
  price_vnd        int  NOT NULL,
  status           text NOT NULL
                   CHECK (status IN ('pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'expired')),
  note             text NOT NULL DEFAULT '',
  cancel_reason    text,
  source           text NOT NULL CHECK (source IN ('online', 'admin')),
  created_by       uuid REFERENCES users (id),
  hold_expires_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at AND end_at <= blocked_until)
);
ALTER SEQUENCE appointment_ref_seq OWNED BY appointments.ref_no;

-- Chống chồng lịch: cùng nhân viên, khoảng [start_at, blocked_until) không được giao nhau.
-- Chỉ lịch Chờ xác nhận / Đã xác nhận chiếm giờ của nhân viên.
ALTER TABLE appointments
  ADD CONSTRAINT no_overlap_per_staff
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(start_at, blocked_until, '[)') WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

CREATE INDEX appointments_start_idx ON appointments (start_at);
CREATE INDEX appointments_customer_idx ON appointments (customer_id);
CREATE INDEX appointments_pending_hold_idx ON appointments (hold_expires_at) WHERE status = 'pending';

CREATE TABLE appointment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments (id) ON DELETE CASCADE,
  type            text NOT NULL,
  message         text NOT NULL,
  actor_type      text NOT NULL CHECK (actor_type IN ('customer', 'user', 'system')),
  actor_id        uuid,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX appointment_events_appt_idx ON appointment_events (appointment_id, created_at);

CREATE TABLE notification_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid REFERENCES appointments (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  body            text NOT NULL,
  send_at         timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_jobs_due_idx ON notification_jobs (send_at) WHERE status = 'pending';

CREATE TABLE idempotency_keys (
  scope          text NOT NULL,
  key            text NOT NULL,
  request_hash   text NOT NULL,
  state          text NOT NULL CHECK (state IN ('processing', 'done')),
  response_code  int,
  response_body  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
