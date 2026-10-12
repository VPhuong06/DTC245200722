import type { Pool } from 'pg';
import { generateLookupCode, Status } from '../appointments/appointments.service';
import { logger } from '../common/json-logger';
import { addDays, vnDateTime, vnToday } from '../common/time';

interface DemoAppointment {
  dayOffset: number;
  time: string;
  customer: string;
  phone: string;
  service: string;
  staff: string;
  status: Status;
  note?: string;
  cancelReason?: string;
}

const SERVICES = [
  { name: 'Tư vấn dịch vụ', description: 'Trao đổi nhu cầu và gợi ý liệu trình phù hợp. Miễn phí.', duration: 30, buffer: 0, price: 0 },
  { name: 'Chăm sóc da', description: 'Làm sạch, tẩy tế bào chết, đắp mặt nạ dưỡng ẩm.', duration: 60, buffer: 10, price: 350_000 },
  { name: 'Massage thư giãn', description: 'Massage toàn thân với tinh dầu, giảm căng cơ.', duration: 60, buffer: 15, price: 450_000 },
  { name: 'Gội đầu dưỡng sinh', description: 'Gội thảo dược kết hợp massage cổ vai gáy.', duration: 45, buffer: 15, price: 250_000 },
];

const STAFF = [
  { name: 'Minh Lan', title: 'Chuyên viên chăm sóc da', services: ['Tư vấn dịch vụ', 'Chăm sóc da', 'Gội đầu dưỡng sinh'] },
  { name: 'Ngọc Anh', title: 'Chuyên viên chăm sóc da', services: ['Tư vấn dịch vụ', 'Chăm sóc da'] },
  { name: 'Gia Bảo', title: 'Kỹ thuật viên massage', services: ['Tư vấn dịch vụ', 'Massage thư giãn', 'Gội đầu dưỡng sinh'] },
];

const DEMO: DemoAppointment[] = [
  { dayOffset: -2, time: '09:30', customer: 'Nguyễn Mai Anh', phone: '0901000001', service: 'Chăm sóc da', staff: 'Ngọc Anh', status: 'completed' },
  { dayOffset: -1, time: '14:00', customer: 'Lê Thu Hà', phone: '0901000003', service: 'Massage thư giãn', staff: 'Gia Bảo', status: 'completed' },
  { dayOffset: 0, time: '09:00', customer: 'Nguyễn Mai Anh', phone: '0901000001', service: 'Chăm sóc da', staff: 'Minh Lan', status: 'completed' },
  { dayOffset: 0, time: '09:30', customer: 'Trần Hoàng Nam', phone: '0901000002', service: 'Massage thư giãn', staff: 'Gia Bảo', status: 'completed' },
  { dayOffset: 0, time: '10:00', customer: 'Lê Thu Hà', phone: '0901000003', service: 'Chăm sóc da', staff: 'Ngọc Anh', status: 'confirmed' },
  { dayOffset: 0, time: '10:30', customer: 'Phạm Minh Tú', phone: '0901000004', service: 'Tư vấn dịch vụ', staff: 'Minh Lan', status: 'pending', note: 'Muốn tìm hiểu gói chăm sóc theo tháng.' },
  { dayOffset: 0, time: '11:00', customer: 'Võ Ngọc Linh', phone: '0901000005', service: 'Massage thư giãn', staff: 'Gia Bảo', status: 'confirmed' },
  { dayOffset: 0, time: '14:00', customer: 'Đặng Thanh Hương', phone: '0901000006', service: 'Chăm sóc da', staff: 'Ngọc Anh', status: 'pending', note: 'Mong được gọi xác nhận trước khi đến.' },
  { dayOffset: 0, time: '14:30', customer: 'Bùi Quốc Huy', phone: '0901000007', service: 'Tư vấn dịch vụ', staff: 'Minh Lan', status: 'confirmed' },
  { dayOffset: 0, time: '15:00', customer: 'Hoàng Bảo Ngọc', phone: '0901000008', service: 'Chăm sóc da', staff: 'Minh Lan', status: 'pending' },
  { dayOffset: 1, time: '10:00', customer: 'Trần Hoàng Nam', phone: '0901000002', service: 'Chăm sóc da', staff: 'Minh Lan', status: 'confirmed' },
  { dayOffset: 1, time: '14:00', customer: 'Võ Ngọc Linh', phone: '0901000005', service: 'Chăm sóc da', staff: 'Ngọc Anh', status: 'pending' },
  { dayOffset: 2, time: '09:00', customer: 'Bùi Quốc Huy', phone: '0901000007', service: 'Massage thư giãn', staff: 'Gia Bảo', status: 'confirmed' },
  { dayOffset: 3, time: '10:30', customer: 'Hoàng Bảo Ngọc', phone: '0901000008', service: 'Chăm sóc da', staff: 'Minh Lan', status: 'confirmed' },
  { dayOffset: 3, time: '14:00', customer: 'Đặng Thanh Hương', phone: '0901000006', service: 'Chăm sóc da', staff: 'Ngọc Anh', status: 'cancelled', cancelReason: 'Khách bận việc đột xuất.' },
];

const STATUS_EVENTS: Partial<Record<Status, string[]>> = {
  confirmed: ['Quản trị viên xác nhận lịch'],
  completed: ['Quản trị viên xác nhận lịch', 'Quản trị viên đánh dấu hoàn thành'],
  no_show: ['Quản trị viên xác nhận lịch', 'Khách không đến theo lịch'],
};

/** Dữ liệu mẫu để demo (chỉ chạy khi chưa có dịch vụ nào). Lịch hẹn mẫu xếp quanh ngày hiện tại. */
export async function seedDemoData(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT 1 FROM services LIMIT 1 FOR UPDATE');
    if (existing.length) {
      await client.query('ROLLBACK');
      return;
    }

    const serviceIds = new Map<string, { id: string; duration: number; buffer: number; price: number }>();
    for (const s of SERVICES) {
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO services (name, description, duration_min, buffer_min, price_vnd) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [s.name, s.description, s.duration, s.buffer, s.price],
      );
      serviceIds.set(s.name, { id: rows[0].id, duration: s.duration, buffer: s.buffer, price: s.price });
    }

    const staffIds = new Map<string, string>();
    for (const st of STAFF) {
      const { rows } = await client.query<{ id: string }>('INSERT INTO staff (full_name, title) VALUES ($1, $2) RETURNING id', [
        st.name,
        st.title,
      ]);
      staffIds.set(st.name, rows[0].id);
      for (const svc of st.services) {
        await client.query('INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)', [rows[0].id, serviceIds.get(svc)!.id]);
      }
      // Thứ Hai → Thứ Bảy, 09:00–17:00.
      for (let weekday = 1; weekday <= 6; weekday++) {
        await client.query(
          "INSERT INTO working_hours (staff_id, weekday, start_time, end_time) VALUES ($1, $2, '09:00', '17:00')",
          [rows[0].id, weekday],
        );
      }
    }

    await client.query(
      `INSERT INTO holidays (day, name) VALUES
         ('2027-01-01', 'Tết Dương lịch'),
         ('2027-02-05', 'Tết Nguyên đán'), ('2027-02-06', 'Tết Nguyên đán'), ('2027-02-07', 'Tết Nguyên đán'),
         ('2027-02-08', 'Tết Nguyên đán'), ('2027-02-09', 'Tết Nguyên đán')
       ON CONFLICT DO NOTHING`,
    );

    const today = vnToday();
    for (const d of DEMO) {
      const svc = serviceIds.get(d.service)!;
      const { rows: cust } = await client.query<{ id: string }>(
        `INSERT INTO customers (full_name, phone, consent_at) VALUES ($1, $2, now())
         ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`,
        [d.customer, d.phone],
      );
      const start = vnDateTime(addDays(today, d.dayOffset), d.time);
      const end = new Date(start.getTime() + svc.duration * 60_000);
      const blocked = new Date(end.getTime() + svc.buffer * 60_000);
      const { rows: appt } = await client.query<{ id: string }>(
        `INSERT INTO appointments (lookup_code, customer_id, service_id, staff_id, start_at, end_at, blocked_until,
                                   duration_min, price_vnd, status, note, cancel_reason, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'online') RETURNING id`,
        [
          generateLookupCode(),
          cust[0].id,
          svc.id,
          staffIds.get(d.staff),
          start,
          end,
          blocked,
          svc.duration,
          svc.price,
          d.status,
          d.note ?? '',
          d.cancelReason ?? null,
        ],
      );
      const messages = ['Khách gửi yêu cầu đặt lịch', ...(STATUS_EVENTS[d.status] ?? [])];
      if (d.status === 'cancelled') messages.push(`Hủy lịch: ${d.cancelReason}`);
      for (const message of messages) {
        await client.query(
          "INSERT INTO appointment_events (appointment_id, type, message, actor_type) VALUES ($1, 'seed', $2, 'system')",
          [appt[0].id, message],
        );
      }
    }

    await client.query('COMMIT');
    logger.info('demo_data_seeded', { services: SERVICES.length, staff: STAFF.length, appointments: DEMO.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
