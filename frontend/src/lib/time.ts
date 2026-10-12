/** Thời gian luôn hiển thị theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ của máy người xem. */
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function shifted(iso: string | Date): Date {
  return new Date(new Date(iso).getTime() + OFFSET_MS);
}

/** 'YYYY-MM-DD' theo giờ VN */
export function dateOf(iso: string | Date): string {
  return shifted(iso).toISOString().slice(0, 10);
}

/** 'HH:mm' theo giờ VN */
export function timeOf(iso: string | Date): string {
  return shifted(iso).toISOString().slice(11, 16);
}

export function vnToday(): string {
  return dateOf(new Date());
}

export function vnNowMinutes(): number {
  const d = shifted(new Date());
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Thứ Hai đầu tuần chứa `date`. */
export function startOfWeek(date: string): string {
  const wd = weekdayOf(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function weekdayName(date: string): string {
  return WEEKDAYS[weekdayOf(date)];
}

export function weekdayShort(date: string): string {
  return WEEKDAYS_SHORT[weekdayOf(date)];
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** 07/10/2026 */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** 07/10 */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Thứ Tư, 7 tháng 10 */
export function formatDayTitle(date: string): string {
  return `${weekdayName(date)}, ${dayOfMonth(date)} tháng ${Number(date.slice(5, 7))}`;
}

/** 07/10/2026 16:30 */
export function formatDateTime(iso: string): string {
  return `${formatDate(dateOf(iso))} ${timeOf(iso)}`;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatDuration(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} ngày`;
  if (min >= 60 && min % 60 === 0) return `${min / 60} giờ`;
  if (min > 60) return `${Math.floor(min / 60)} giờ ${min % 60} phút`;
  return `${min} phút`;
}

export function formatPrice(vnd: number): string {
  if (!vnd) return 'Miễn phí';
  return `${vnd.toLocaleString('vi-VN')} đ`;
}
