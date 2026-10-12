import { describe, expect, it } from 'vitest';
import { addDays, dateOf, formatDayTitle, formatPrice, startOfWeek, timeOf } from './time';

describe('time (giờ Việt Nam)', () => {
  it('đổi thời điểm UTC sang ngày/giờ VN', () => {
    expect(dateOf('2026-10-07T17:30:00Z')).toBe('2026-10-08');
    expect(timeOf('2026-10-07T09:00:00Z')).toBe('16:00');
  });

  it('tuần bắt đầu từ Thứ Hai', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(addDays('2026-10-05', 6)).toBe('2026-10-11');
  });

  it('định dạng tiêu đề ngày và giá', () => {
    expect(formatDayTitle('2026-10-07')).toBe('Thứ Tư, 7 tháng 10');
    expect(formatPrice(0)).toBe('Miễn phí');
  });
});
