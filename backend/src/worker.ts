import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import nodemailer, { Transporter } from 'nodemailer';
import { WorkerModule } from './app.module';
import { AppointmentsService } from './appointments/appointments.service';
import { logger } from './common/json-logger';
import { config } from './config';
import { DbService } from './db/db.service';
import { IdempotencyService } from './idempotency/idempotency.service';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 30_000);
const MAX_ATTEMPTS = 5;

interface Job {
  id: string;
  appointment_id: string | null;
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
}

function createMailer(): Transporter | null {
  const smtp = config().smtp;
  if (!smtp.host) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  });
}

/** Che email trong log: an***@gmail.com */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain ?? ''}`;
}

/**
 * Worker chạy định kỳ:
 *  - chuyển lịch Chờ xác nhận quá thời gian giữ chỗ sang Hết hạn;
 *  - gửi email trong notification_jobs, lỗi thì thử lại với thời gian chờ tăng dần;
 *  - dọn Idempotency-Key cũ.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger });
  const db = app.get(DbService);
  const appointments = app.get(AppointmentsService);
  const idempotency = app.get(IdempotencyService);
  const mailer = createMailer();
  if (!mailer) logger.write('warn', 'smtp_not_configured', { note: 'Email sẽ được đánh dấu skipped' });

  let stopping = false;
  let lastPurge = 0;

  async function processJobs(): Promise<void> {
    const jobs = await db.query<Job>(
      `WITH due AS (
         SELECT id FROM notification_jobs
          WHERE status = 'pending' AND send_at <= now()
          ORDER BY send_at LIMIT 20
          FOR UPDATE SKIP LOCKED)
       UPDATE notification_jobs j SET attempts = j.attempts + 1
         FROM due WHERE j.id = due.id
       RETURNING j.id, j.appointment_id, j.kind, j.recipient, j.subject, j.body, j.attempts`,
    );
    for (const job of jobs) {
      if (job.kind === 'reminder' && job.appointment_id) {
        const appt = await db.one<{ status: string; start_at: Date }>('SELECT status, start_at FROM appointments WHERE id = $1', [
          job.appointment_id,
        ]);
        if (!appt || appt.status !== 'confirmed' || appt.start_at.getTime() < Date.now()) {
          await db.query("UPDATE notification_jobs SET status = 'cancelled' WHERE id = $1", [job.id]);
          continue;
        }
      }
      if (!mailer) {
        await db.query("UPDATE notification_jobs SET status = 'skipped', last_error = 'SMTP chưa cấu hình' WHERE id = $1", [job.id]);
        logger.info('email_skipped', { job_id: job.id, kind: job.kind, to: maskEmail(job.recipient) });
        continue;
      }
      try {
        await mailer.sendMail({ from: config().smtp.from, to: job.recipient, subject: job.subject, text: job.body });
        await db.query("UPDATE notification_jobs SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1", [job.id]);
        logger.info('email_sent', { job_id: job.id, kind: job.kind, to: maskEmail(job.recipient) });
      } catch (err) {
        const message = (err as Error).message.slice(0, 500);
        const failed = job.attempts >= MAX_ATTEMPTS;
        await db.query(
          `UPDATE notification_jobs
              SET status = $2, last_error = $3,
                  send_at = now() + make_interval(mins => $4)
            WHERE id = $1`,
          [job.id, failed ? 'failed' : 'pending', message, 2 ** job.attempts],
        );
        logger.write(failed ? 'error' : 'warn', 'email_failed', {
          job_id: job.id,
          kind: job.kind,
          attempts: job.attempts,
          will_retry: !failed,
          error: message,
        });
      }
    }
  }

  async function tick(): Promise<void> {
    const expired = await appointments.expireHolds();
    if (expired) logger.info('appointments_expired', { count: expired });
    await processJobs();
    if (Date.now() - lastPurge > 60 * 60 * 1000) {
      const purged = await idempotency.purge();
      lastPurge = Date.now();
      if (purged) logger.info('idempotency_keys_purged', { count: purged });
    }
  }

  async function loop(): Promise<void> {
    while (!stopping) {
      try {
        await tick();
      } catch (err) {
        logger.error('worker_tick_failed', { error: (err as Error).message, stack: (err as Error).stack });
      }
      await new Promise((resolve) => setTimeout(resolve, TICK_MS));
    }
  }

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('worker_stopping', { signal });
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info('worker_started', { tick_ms: TICK_MS });
  await loop();
}

main().catch((err) => {
  logger.error('worker_start_failed', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
