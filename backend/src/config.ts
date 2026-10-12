function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export interface AppConfig {
  port: number;
  db: { host: string; port: number; database: string; user: string; password: string };
  jwtSecret: string;
  cookieSecure: boolean;
  adminEmail: string;
  adminPassword: string;
  seedDemo: boolean;
  publicUrl: string;
  smtp: { host: string; port: number; user: string; password: string; from: string; secure: boolean };
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET phải dài tối thiểu 32 ký tự');
  }
  cached = {
    port: Number(process.env.PORT ?? 3000),
    db: {
      host: process.env.DB_HOST ?? 'postgres',
      port: Number(process.env.DB_PORT ?? 5432),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
    },
    jwtSecret,
    cookieSecure: bool('COOKIE_SECURE', true),
    adminEmail: process.env.ADMIN_EMAIL ?? '',
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    seedDemo: bool('SEED_DEMO', true),
    publicUrl: process.env.PUBLIC_URL ?? 'https://localhost',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? '',
      password: process.env.SMTP_PASSWORD ?? '',
      from: process.env.SMTP_FROM ?? 'Hẹn · An Nhiên Studio <no-reply@localhost>',
      secure: bool('SMTP_SECURE', false),
    },
  };
  return cached;
}
