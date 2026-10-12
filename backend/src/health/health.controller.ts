import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DbService } from '../db/db.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** Dùng cho healthcheck của Docker Compose: kiểm tra kết nối PostgreSQL. */
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'ok' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', db: 'unreachable' };
    }
  }
}
