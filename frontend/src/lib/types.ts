export type Status = 'pending' | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'expired';

export const STATUS_ORDER: Status[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired'];

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  no_show: 'Không đến',
  cancelled: 'Đã hủy',
  expired: 'Hết hạn',
};

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceVnd: number;
  active: boolean;
}

export interface WorkingHour {
  weekday: number;
  start: string;
  end: string;
}

export interface Staff {
  id: string;
  fullName: string;
  title: string;
  active?: boolean;
  serviceIds: string[];
  workingHours?: WorkingHour[];
}

export interface Appointment {
  id: string;
  ref: string;
  lookupCode: string;
  status: Status;
  startAt: string;
  endAt: string;
  durationMin: number;
  priceVnd: number;
  note: string;
  cancelReason: string | null;
  source: 'online' | 'admin';
  holdExpiresAt: string | null;
  createdAt: string;
  customer: { id: string; fullName: string; phone: string; email: string | null };
  service: { id: string; name: string };
  staff: { id: string; fullName: string };
}

export interface AppointmentEvent {
  id: string;
  type: string;
  message: string;
  actorType: string;
  createdAt: string;
}

export interface AppointmentDetail extends Appointment {
  events: AppointmentEvent[];
}

export interface CustomerAppointment extends AppointmentDetail {
  changeDeadline: string;
  canChange: boolean;
}

export interface AppointmentList {
  items: Appointment[];
  counts: Record<string, number>;
}

export interface Availability {
  date: string;
  closed: boolean;
  message?: string;
  slots: { time: string; staffIds: string[] }[];
}

export interface Policy {
  slotStepMin: number;
  minAdvanceMin: number;
  maxAdvanceDays: number;
  holdMin: number;
  autoConfirm: boolean;
  changeDeadlineMin: number;
  reminderOffsetsMin?: number[];
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  totalAppointments: number;
  completed: number;
  noShow: number;
  cancelled: number;
  lastAppointmentAt: string | null;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  staffId: string | null;
}
