export type Role = 'admin' | 'staff';

/** Người thực hiện thao tác, dùng để phân quyền và ghi lịch sử. */
export interface Actor {
  type: 'customer' | 'user' | 'system';
  id?: string;
  name: string;
  role?: Role;
  staffId?: string | null;
}

export const CUSTOMER_ACTOR: Actor = { type: 'customer', name: 'Khách' };
export const SYSTEM_ACTOR: Actor = { type: 'system', name: 'Hệ thống' };

export interface SessionUser {
  sub: string;
  name: string;
  email: string;
  role: Role;
  staffId: string | null;
}

export function actorFromUser(user: SessionUser): Actor {
  return { type: 'user', id: user.sub, name: user.name, role: user.role, staffId: user.staffId };
}
