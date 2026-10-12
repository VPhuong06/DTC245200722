// Kiểm thử nhanh API: đặt lịch, trùng giờ, idempotency, đặt đồng thời, phân quyền.
// Chạy sau khi hệ thống đã lên (cần Node.js 18+ trên máy):
//   1. Đặt RATE_LIMIT_MULTIPLIER=10 trong .env rồi `docker compose up -d` (kịch bản tạo nhiều lịch liên tiếp).
//   2. ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.mjs
// Mặc định gọi https://localhost (chứng chỉ tự ký); đặt BASE_URL để đổi.
// Lưu ý: kịch bản ghi dữ liệu thử nghiệm vào cơ sở dữ liệu.
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
const ORIGIN = process.env.BASE_URL ?? 'https://localhost';
const BASE = `${ORIGIN}/api/v1`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@annhien.vn';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
let cookie = '';
let failures = 0;

function check(name, cond, extra) {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.log(`  ✘ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie, 'x-requested-with': 'XMLHttpRequest' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const weekday = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
function workDay(from) {
  let d = from;
  while (weekday(d) === 0) d = addDays(d, 1);
  return d;
}

console.log('1. Health, dịch vụ, nhân viên');
const health = await api('GET', '/health');
check('health 200', health.status === 200, health.body);
const services = (await api('GET', '/services')).body;
check('có 4 dịch vụ', services.length === 4, services);
const tuVan = services.find((s) => s.name === 'Tư vấn dịch vụ');
const chamSoc = services.find((s) => s.name === 'Chăm sóc da');
const goiDau = services.find((s) => s.name === 'Gội đầu dưỡng sinh');
const staff = (await api('GET', `/staff?serviceId=${chamSoc.id}`)).body;
check('2 nhân viên làm Chăm sóc da', staff.length === 2, staff);
const minhLan = staff.find((s) => s.fullName === 'Minh Lan');

console.log('2. Giờ trống');
// Tìm một ngày làm việc mà Minh Lan và Ngọc Anh còn trống cả ngày (mỗi lần chạy dùng ngày khác).
const ngocAnh = staff.find((s) => s.fullName === 'Ngọc Anh');
let day;
let av;
for (let offset = 3; offset <= 29 && !day; offset++) {
  const d = addDays(vnToday(), offset);
  if (weekday(d) === 0) continue;
  const a = (await api('GET', `/availability?serviceId=${tuVan.id}&date=${d}&staffId=${minhLan.id}`)).body;
  const b = (await api('GET', `/availability?serviceId=${chamSoc.id}&date=${d}&staffId=${ngocAnh.id}`)).body;
  if (a.slots?.length === 16 && b.slots?.length === 14) {
    day = d;
    av = a;
  }
}
if (!day) {
  console.log('Không còn ngày trống trong 30 ngày tới để kiểm thử.');
  process.exit(1);
}
console.log(`  (ngày kiểm thử: ${day})`);
check('có giờ 09:00 và 16:30', av.slots.some((s) => s.time === '09:00') && av.slots.some((s) => s.time === '16:30'), av);
const sunday = (() => { let d = addDays(vnToday(), 2); while (weekday(d) !== 0) d = addDays(d, 1); return d; })();
const avSun = (await api('GET', `/availability?serviceId=${tuVan.id}&date=${sunday}`)).body;
check('Chủ nhật đóng cửa', avSun.closed === true && avSun.slots.length === 0, avSun);
const avGoi = (await api('GET', `/availability?serviceId=${goiDau.id}&date=${day}&staffId=${minhLan.id}`)).body;
check('Gội đầu 45+15 phút: giờ cuối 16:00', avGoi.slots.at(-1).time === '16:00', avGoi.slots.at(-1));

console.log('3. Đặt lịch + idempotency');
const booking = {
  customer: { fullName: 'Nguyễn Khánh Vy', phone: '0901 234 567', email: 'vy@example.com' },
  serviceId: tuVan.id,
  staffId: minhLan.id,
  date: day,
  time: '15:00',
  note: 'Khách đặt lịch tư vấn lần đầu.',
  consent: true,
};
const noKey = await api('POST', '/appointments', booking);
check('thiếu Idempotency-Key → 400', noKey.status === 400, noKey.body);
const key = 'test-' + Date.now();
const created = await api('POST', '/appointments', booking, { 'idempotency-key': key });
check('tạo lịch 201', created.status === 201, created.body);
check('trạng thái Chờ xác nhận', created.body.status === 'pending', created.body.status);
const replay = await api('POST', '/appointments', booking, { 'idempotency-key': key });
check('gửi lại cùng key → cùng lịch', replay.status === 201 && replay.body.id === created.body.id && replay.headers.get('idempotent-replayed') === 'true', replay.body);
const reused = await api('POST', '/appointments', { ...booking, time: '16:00' }, { 'idempotency-key': key });
check('cùng key khác nội dung → 422', reused.status === 422, reused.body);

console.log('4. Trùng giờ');
const clash = await api('POST', '/appointments', { ...booking, customer: { fullName: 'Khách Khác', phone: '0912345678' }, time: '15:00' }, { 'idempotency-key': 'clash-' + Date.now() });
check('trùng giờ → 409 BOOKING_CONFLICT', clash.status === 409 && clash.body.error.code === 'BOOKING_CONFLICT', clash.body);
check('thông báo có giờ 15:00–15:30', /Minh Lan đã có lịch 15:00–15:30/.test(clash.body.error?.message), clash.body.error?.message);
check('có request_id', !!clash.body.error?.request_id);
const outside = await api('POST', '/appointments', { ...booking, customer: { fullName: 'Khách Khác', phone: '0912345678' }, time: '16:45' }, { 'idempotency-key': 'out-' + Date.now() });
check('ngoài giờ làm → 400 OUTSIDE_WORKING_HOURS', outside.status === 400 && outside.body.error.code === 'OUTSIDE_WORKING_HOURS', outside.body);
const anyStaff = await api('POST', '/appointments', { ...booking, serviceId: chamSoc.id, staffId: null, customer: { fullName: 'Khách Bất Kỳ', phone: '0912000001' }, time: '15:00' }, { 'idempotency-key': 'any-' + Date.now() });
check('"nhân viên bất kỳ" gán người còn trống (Ngọc Anh)', anyStaff.status === 201 && anyStaff.body.staff.fullName === 'Ngọc Anh', anyStaff.body);

console.log('5. Đặt đồng thời 10 yêu cầu cùng giờ, cùng nhân viên');
const results = await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    api('POST', '/appointments', { ...booking, customer: { fullName: `Khách ${i}`, phone: `09330000${String(i).padStart(2, '0')}` }, time: '10:00' }, { 'idempotency-key': `race-${Date.now()}-${i}` }),
  ),
);
const ok = results.filter((r) => r.status === 201).length;
const conflicts = results.filter((r) => r.status === 409).length;
check('chỉ 1 lịch thành công, 9 lịch bị 409', ok === 1 && conflicts === 9, results.map((r) => r.status));

console.log('6. Tra cứu bằng mã + SĐT');
const lookup = await api('POST', '/appointments/lookup', { code: created.body.lookupCode, phone: '0901234567' });
check('tra cứu đúng', lookup.status === 200 && lookup.body.id === created.body.id && lookup.body.canChange === true, lookup.body);
const wrong = await api('POST', '/appointments/lookup', { code: created.body.lookupCode, phone: '0999999999' });
check('sai SĐT → 404', wrong.status === 404, wrong.body);

console.log('7. Quản trị');
const noAuth = await api('GET', `/admin/appointments?from=${day}&to=${day}`);
check('chưa đăng nhập → 401', noAuth.status === 401, noAuth.body);
const badLogin = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: 'sai-mat-khau' });
check('sai mật khẩu → 401', badLogin.status === 401, badLogin.body);
const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
check('đăng nhập 200', login.status === 200 && cookie.startsWith('hen_session='), login.body);
const csrf = await fetch(BASE + `/admin/appointments/${created.body.id}/confirm`, { method: 'POST', headers: { cookie } });
check('thiếu header CSRF → 403', csrf.status === 403);
const list = await api('GET', `/admin/appointments?from=${day}&to=${day}`);
check('danh sách có counts', list.status === 200 && list.body.counts.all >= 3, list.body.counts);
const confirmed = await api('POST', `/admin/appointments/${created.body.id}/confirm`);
check('xác nhận → confirmed', confirmed.body.status === 'confirmed', confirmed.body);
const resClash = await api('POST', `/admin/appointments/${created.body.id}/reschedule`, { staffId: minhLan.id, date: day, time: '10:00' });
check('đổi sang giờ đã có lịch → 409, lịch cũ giữ nguyên', resClash.status === 409, resClash.body);
const still = await api('GET', `/admin/appointments/${created.body.id}`);
check('lịch vẫn ở 15:00', still.body.startAt === created.body.startAt, still.body.startAt);
const moved = await api('POST', `/admin/appointments/${created.body.id}/reschedule`, { staffId: minhLan.id, date: day, time: '15:30' });
check('đổi 15:00 → 15:30 (chồng lên chính nó vẫn được)', moved.status === 200 && moved.body.events.some((e) => e.type === 'rescheduled'), moved.body);
const done = await api('POST', `/admin/appointments/${created.body.id}/complete`);
check('hoàn thành', done.body.status === 'completed', done.body);
const cancelDone = await api('POST', `/admin/appointments/${created.body.id}/cancel`, { reason: 'thử hủy' });
check('không hủy được lịch đã hoàn thành → 400', cancelDone.status === 400 && cancelDone.body.error.code === 'INVALID_STATUS', cancelDone.body);
const reuse = await api('POST', '/appointments', { ...booking, customer: { fullName: 'Khách Sau', phone: '0944000000' }, time: '15:30' }, { 'idempotency-key': 'after-' + Date.now() });
check('lịch hoàn thành không còn chiếm giờ', reuse.status === 201, reuse.body);
const cancel = await api('POST', `/admin/appointments/${reuse.body.id}/cancel`, { reason: 'Khách có việc đột xuất' });
check('hủy có lý do', cancel.body.status === 'cancelled' && cancel.body.cancelReason === 'Khách có việc đột xuất', cancel.body);

const adminCreate = await api('POST', '/admin/appointments', { customer: { fullName: 'Khách gọi điện', phone: '0955000000' }, serviceId: tuVan.id, staffId: minhLan.id, date: day, time: '11:00', note: '' }, { 'idempotency-key': 'admin-' + Date.now() });
check('quản trị tạo lịch hộ', adminCreate.status === 201 && adminCreate.body.events[0].message.includes('tạo lịch'), adminCreate.body);
const ns1 = await api('POST', `/admin/appointments/${adminCreate.body.id}/no-show`);
check('không đến khi chưa xác nhận → 400', ns1.status === 400, ns1.body);
await api('POST', `/admin/appointments/${adminCreate.body.id}/confirm`);
const ns2 = await api('POST', `/admin/appointments/${adminCreate.body.id}/no-show`);
check('khách không đến', ns2.body.status === 'no_show', ns2.body);

const stats = await api('GET', `/admin/stats?from=${vnToday()}&to=${addDays(vnToday(), 30)}`);
check('thống kê', stats.status === 200 && stats.body.byStatus.length > 0, stats.body);
const customers = await api('GET', '/admin/customers?q=Vy');
check('tìm khách hàng', customers.body.some((c) => c.fullName === 'Nguyễn Khánh Vy'), customers.body);
const docs = await fetch(`${ORIGIN}/api/docs/openapi.json`);
check('OpenAPI', docs.status === 200);

console.log(failures ? `\n${failures} kiểm tra thất bại` : '\nTất cả kiểm tra đều qua');
process.exit(failures ? 1 : 0);
