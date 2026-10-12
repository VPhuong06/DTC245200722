import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { Actor, actorFromUser, Role, SessionUser } from './actor';
import { AuthService, SESSION_COOKIE } from './auth.service';

type AuthedRequest = Request & { user?: SessionUser };

const ROLES_KEY = 'roles';

/** Chỉ cho phép các vai trò được liệt kê. Dùng kèm AuthGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Kiểm tra cookie phiên (JWT, HttpOnly) và vai trò trên mọi thao tác quản trị. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE];
    const user = token ? await this.auth.verify(token) : null;
    if (!user) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
    }
    req.user = user;
    return true;
  }
}

/** Lấy người thao tác (Actor) từ phiên đăng nhập. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return actorFromUser(req.user!);
});

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Chống CSRF: request thay đổi dữ liệu có kèm cookie phiên phải mang header X-Requested-With.
 * Trình duyệt không cho trang web khác tự gắn header này nếu không qua CORS preflight (đã không bật CORS).
 * Cookie phiên còn đặt SameSite=Strict nên là lớp bảo vệ thứ hai.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(req.method) || !req.cookies?.[SESSION_COOKIE]) return true;
    if (req.header('x-requested-with') !== 'XMLHttpRequest') {
      throw new AppError(HttpStatus.FORBIDDEN, 'CSRF_REJECTED', 'Yêu cầu bị từ chối (thiếu header chống CSRF)');
    }
    return true;
  }
}

// ---------------------------------------------------------------- Giới hạn tốc độ trong ứng dụng

interface RateRule {
  bucket: string;
  limit: number;
  windowSec: number;
}

const RATE_KEY = 'rate_limit';

/** Giới hạn số request theo IP trong một cửa sổ thời gian (bổ sung cho limit_req của Nginx). */
export const RateLimit = (bucket: string, limit: number, windowSec: number) =>
  SetMetadata(RATE_KEY, { bucket, limit, windowSec } satisfies RateRule);

// Hệ số nhân giới hạn, dùng khi chạy kiểm thử tải (k6) từ một IP; mặc định 1.
const RATE_MULTIPLIER = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1) || 1);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.get<RateRule | undefined>(RATE_KEY, ctx.getHandler());
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = `${rule.bucket}:${req.ip}`;
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 });
      return true;
    }
    entry.count++;
    if (entry.count > rule.limit * RATE_MULTIPLIER) {
      const res = ctx.switchToHttp().getResponse();
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút');
    }
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
