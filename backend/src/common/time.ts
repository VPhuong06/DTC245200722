/**
 * Tiện ích thời gian theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè).
 * Ngày dạng 'YYYY-MM-DD', giờ dạng 'HH:mm'.
 */
export const VN_OFFSET_MIN = 7 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Thời điểm UTC tương ứng với ngày + giờ theo giờ Việt Nam. */
export function vnDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

/** Thời điểm 00:00 (giờ VN) của một ngày. */
export function vnStartOfDay(date: string): Date {
  return vnDateTime(date, '00:00');
}

function shifted(d: Date): Date {
  return new Date(d.getTime() + VN_OFFSET_MIN * 60 * 1000);
}

export function vnDateOf(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function vnTimeOf(d: Date): string {
  return shifted(d).toISOString().slice(11, 16);
}

/** Số phút tính từ 00:00 giờ VN của ngày `date`. Có thể âm hoặc > 1440 nếu d nằm ngoài ngày đó. */
export function minutesFromVnMidnight(date: string, d: Date): number {
  return Math.round((d.getTime() - vnStartOfDay(date).getTime()) / 60000);
}

export function vnToday(now = new Date()): string {
  return vnDateOf(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Chủ nhật ... 6 = Thứ bảy */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 'HH:mm' hoặc 'HH:mm:ss' → số phút trong ngày. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 07/10/2026 */
export function formatVnDate(d: Date): string {
  const [y, m, day] = vnDateOf(d).split('-');
  return `${day}/${m}/${y}`;
}

/** 07/10/2026 16:30 */
export function formatVnDateTime(d: Date): string {
  return `${formatVnDate(d)} ${vnTimeOf(d)}`;
}
