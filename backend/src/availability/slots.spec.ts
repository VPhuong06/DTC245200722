import { computeSlots, isStaffFree, StaffDay } from './slots';

const h = (hh: number, mm = 0) => hh * 60 + mm;

const minhLan: StaffDay = {
  staffId: 'minh-lan',
  windows: [[h(9), h(17)]],
  busy: [[h(15), h(16)]], // đang có lịch 15:00–16:00
};

describe('computeSlots', () => {
  it('không trả về giờ chồng lên lịch đã có', () => {
    const slots = computeSlots({ stepMin: 30, durationMin: 30, bufferMin: 0, earliestMinute: null, staff: [minhLan] });
    const minutes = slots.map((s) => s.minute);
    expect(minutes).not.toContain(h(15));
    expect(minutes).not.toContain(h(15, 30));
    expect(minutes).toContain(h(14, 30)); // 14:30–15:00 liền kề, không trùng
    expect(minutes).toContain(h(16)); // 16:00 ngay khi lịch cũ kết thúc
    expect(minutes).toContain(h(16, 30)); // 16:30–17:00 vừa hết ca
  });

  it('dịch vụ 45 phút + 15 phút đệm phải nằm trọn trong ca làm', () => {
    const slots = computeSlots({
      stepMin: 15,
      durationMin: 45,
      bufferMin: 15,
      earliestMinute: null,
      staff: [{ staffId: 'a', windows: [[h(9), h(17)]], busy: [] }],
    });
    const last = slots[slots.length - 1].minute;
    expect(last).toBe(h(16)); // 16:00 + 45 + 15 = 17:00
    expect(slots.map((s) => s.minute)).not.toContain(h(16, 15));
  });

  it('thời gian đệm của lịch mới không được chạm vào lịch kế tiếp', () => {
    const day: StaffDay = { staffId: 'a', windows: [[h(9), h(17)]], busy: [[h(10), h(11)]] };
    expect(isStaffFree(day, h(9), 45, 15)).toBe(true); // 9:00–10:00 kể cả đệm
    expect(isStaffFree(day, h(9, 15), 45, 15)).toBe(false); // đệm tràn sang 10:00–10:15
  });

  it('bỏ các giờ trước mốc đặt trước tối thiểu', () => {
    const slots = computeSlots({
      stepMin: 30,
      durationMin: 30,
      bufferMin: 0,
      earliestMinute: h(13, 10),
      staff: [{ staffId: 'a', windows: [[h(9), h(17)]], busy: [] }],
    });
    expect(slots[0].minute).toBe(h(13, 30));
  });

  it('gộp giờ trống của nhiều nhân viên cho lựa chọn "nhân viên bất kỳ"', () => {
    const giaBao: StaffDay = { staffId: 'gia-bao', windows: [[h(9), h(17)]], busy: [] };
    const slots = computeSlots({ stepMin: 30, durationMin: 60, bufferMin: 0, earliestMinute: null, staff: [minhLan, giaBao] });
    const at15 = slots.find((s) => s.minute === h(15));
    expect(at15?.staffIds).toEqual(['gia-bao']);
    const at9 = slots.find((s) => s.minute === h(9));
    expect(at9?.staffIds.sort()).toEqual(['gia-bao', 'minh-lan']);
  });

  it('không có ca làm thì không có giờ trống', () => {
    const slots = computeSlots({
      stepMin: 30,
      durationMin: 30,
      bufferMin: 0,
      earliestMinute: null,
      staff: [{ staffId: 'a', windows: [], busy: [] }],
    });
    expect(slots).toEqual([]);
  });
});
