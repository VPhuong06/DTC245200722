import { logger } from '../common/json-logger';
import { createPool } from './db.service';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  const pool = createPool();
  try {
    await runMigrations(pool);
    logger.info('migrations_done');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error('migrations_failed', { error: (err as Error).message });
  process.exit(1);
});
