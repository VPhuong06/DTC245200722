import { Injectable } from '@nestjs/common';
import { config } from '../config';
import { formatVnDate, vnTimeOf } from '../common/time';
import type { Queryable } from '../db/db.service';

export type NotificationKind = 'received' | 'confirmed' | 'rescheduled' | 'cancelled' | 'expired' | 'reminder';

export interface NotifyAppointment {
  id: string;
  ref: string;
  lookupCode: string;
  customerName: string;
  customerEmail: string | null;
  serviceName: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
}

const SUBJECTS: Record<NotificationKind, string> = {
  received: 'Đã nhận yêu cầu đặt lịch',
  confirmed: 'Lịch hẹn đã được xác nhận',
  rescheduled: 'Lịch hẹn đã được đổi',
  cancelled: 'Lịch hẹn đã bị hủy',
  expired: 'Yêu cầu đặt lịch đã hết hạn',
  reminder: 'Nhắc lịch hẹn',
};

const INTROS: Record<NotificationKind, string> = {
  received: 'Chúng tôi đã nhận yêu cầu đặt lịch của bạn và sẽ xác nhận sớm.',
  confirmed: 'Lịch hẹn của bạn đã được xác nhận.',
  rescheduled: 'Lịch hẹn của bạn đã được chuyển sang thời gian mới.',
  cancelled: 'Lịch hẹn của bạn đã được hủy.',
  expired: 'Yêu cầu đặt lịch chưa được xác nhận trong thời gian giữ chỗ nên đã hết hạn.',
  reminder: 'Bạn có lịch hẹn sắp tới.',
};

/**
 * Tạo công việc gửi email trong bảng notification_jobs (cùng giao dịch với thay đổi lịch).
 * Worker đọc bảng này để gửi và thử lại khi lỗi, nên gửi email lỗi không làm mất lịch.
 */
@Injectable()
export class NotificationsService {
  async enqueue(client: Queryable, appt: NotifyAppointment, kind: NotificationKind, sendAt = new Date()): Promise<void> {
    if (!appt.customerEmail) return;
    const subject = `[Hẹn] ${SUBJECTS[kind]} · ${appt.ref}`;
    const body = [
      `Chào ${appt.customerName},`,
      '',
      INTROS[kind],
      '',
      `Mã lịch: ${appt.ref} · Mã tra cứu: ${formatLookupCode(appt.lookupCode)}`,
      `Dịch vụ: ${appt.serviceName}`,
      `Thời gian: ${formatVnDate(appt.startAt)} ${vnTimeOf(appt.startAt)}–${vnTimeOf(appt.endAt)}`,
      `Nhân viên: ${appt.staffName}`,
      '',
      `Tra cứu, đổi hoặc hủy lịch: ${config().publicUrl}/tra-cuu`,
      '',
      'Hẹn · An Nhiên Studio',
    ].join('\n');
    await client.query(
      `INSERT INTO notification_jobs (appointment_id, kind, recipient, subject, body, send_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [appt.id, kind, appt.customerEmail, subject, body, sendAt],
    );
  }

  /** Lên lịch email nhắc trước giờ hẹn theo chính sách (bỏ qua mốc đã qua). */
  async scheduleReminders(client: Queryable, appt: NotifyAppointment, offsetsMin: number[]): Promise<void> {
    const now = Date.now();
    for (const offset of offsetsMin) {
      const sendAt = new Date(appt.startAt.getTime() - offset * 60_000);
      if (sendAt.getTime() > now) await this.enqueue(client, appt, 'reminder', sendAt);
    }
  }

  async cancelPending(client: Queryable, appointmentId: string, kinds: NotificationKind[] = ['reminder']): Promise<void> {
    await client.query(
      `UPDATE notification_jobs SET status = 'cancelled'
        WHERE appointment_id = $1 AND status = 'pending' AND kind = ANY($2)`,
      [appointmentId, kinds],
    );
  }
}

export function formatLookupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
