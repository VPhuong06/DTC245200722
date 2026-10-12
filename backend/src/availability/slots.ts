/** Khoảng [start, end) tính bằng phút kể từ 00:00 giờ VN của ngày đang xét. */
export type Interval = [number, number];

export interface StaffDay {
  staffId: string;
  /** Ca làm trong ngày. */
  windows: Interval[];
  /** Thời gian đã bị chiếm: lịch Chờ xác nhận/Đã xác nhận (gồm đệm) và nghỉ phép. */
  busy: Interval[];
}

export interface SlotInput {
  stepMin: number;
  durationMin: number;
  bufferMin: number;
  /** Giờ bắt đầu sớm nhất được phép (đặt trước tối thiểu); null nếu không giới hạn. */
  earliestMinute: number | null;
  staff: StaffDay[];
}

export interface Slot {
  minute: number;
  staffIds: string[];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Một nhân viên có rảnh trong khoảng [start, start + thời lượng + đệm) và khoảng đó nằm trọn trong ca làm không. */
export function isStaffFree(day: StaffDay, start: number, durationMin: number, bufferMin: number): boolean {
  const need: Interval = [start, start + durationMin + bufferMin];
  const insideWindow = day.windows.some(([ws, we]) => need[0] >= ws && need[1] <= we);
  return insideWindow && !day.busy.some((b) => overlaps(need, b));
}

/**
 * Tính các giờ bắt đầu còn trống. Giờ bắt đầu chạy theo bước từ đầu mỗi ca;
 * cả thời lượng và thời gian đệm phải nằm trong ca và không giao với lịch đã có.
 * Với nhiều nhân viên, kết quả là hợp các giờ trống, kèm danh sách nhân viên rảnh ở giờ đó.
 */
export function computeSlots(input: SlotInput): Slot[] {
  const { stepMin, durationMin, bufferMin, earliestMinute, staff } = input;
  const byMinute = new Map<number, string[]>();

  for (const day of staff) {
    for (const [ws, we] of day.windows) {
      for (let t = ws; t + durationMin + bufferMin <= we; t += stepMin) {
        if (earliestMinute !== null && t < earliestMinute) continue;
        if (!isStaffFree(day, t, durationMin, bufferMin)) continue;
        const list = byMinute.get(t) ?? [];
        if (!list.includes(day.staffId)) list.push(day.staffId);
        byMinute.set(t, list);
      }
    }
  }

  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, staffIds]) => ({ minute, staffIds }));
}
