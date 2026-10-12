import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AppError } from '../common/app-error';
import { logger } from '../common/json-logger';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { Role, SessionUser } from './actor';

export const SESSION_COOKIE = 'hen_session';
export const SESSION_TTL_SEC = 8 * 60 * 60;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  staff_id: string | null;
  failed_logins: number;
  locked_until: Date | null;
}

// Hash giả để so sánh khi email không tồn tại, giữ thời gian phản hồi tương đương (chống dò email).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.db.one<UserRow>('SELECT * FROM users WHERE email = $1', [normalized]);
    const invalid = new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      logger.write('warn', 'login_failed', { reason: 'unknown_user' });
      throw invalid;
    }
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      logger.write('warn', 'login_failed', { reason: 'locked', user_id: user.id });
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`,
      );
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.db.query(
        `UPDATE users SET failed_logins = $2,
                locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
          WHERE id = $1`,
        [user.id, lock ? 0 : failed, lock, LOCK_MINUTES],
      );
      logger.write('warn', 'login_failed', { reason: 'bad_password', user_id: user.id, attempts: failed });
      throw invalid;
    }

    await this.db.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    const session: SessionUser = {
      sub: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      staffId: user.staff_id,
    };
    const token = await this.jwt.signAsync(session, { expiresIn: SESSION_TTL_SEC });
    logger.info('login_succeeded', { user_id: user.id, role: user.role });
    return { token, user: session };
  }

  async verify(token: string): Promise<SessionUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<SessionUser & { iat: number; exp: number }>(token);
      return { sub: payload.sub, name: payload.name, email: payload.email, role: payload.role, staffId: payload.staffId };
    } catch {
      return null;
    }
  }

  /** Tạo tài khoản quản trị đầu tiên từ ADMIN_EMAIL / ADMIN_PASSWORD nếu hệ thống chưa có người dùng. */
  async bootstrapAdmin(): Promise<void> {
    const { adminEmail, adminPassword } = config();
    const existing = await this.db.one<{ count: number }>('SELECT count(*) AS count FROM users');
    if (existing && existing.count > 0) return;
    if (!adminEmail || !adminPassword) {
      logger.write('warn', 'admin_not_created', { reason: 'ADMIN_EMAIL/ADMIN_PASSWORD chưa được đặt' });
      return;
    }
    if (adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD phải dài tối thiểu 12 ký tự');
    }
    const hash = await bcrypt.hash(adminPassword, 12);
    await this.db.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Quản trị viên', 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail.trim().toLowerCase(), hash],
    );
    logger.info('admin_created', { email: adminEmail.trim().toLowerCase() });
  }
}
