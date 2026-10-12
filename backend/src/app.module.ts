import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAppointmentsController } from './admin/admin-appointments.controller';
import { AdminCatalogController } from './admin/admin-catalog.controller';
import { AppointmentsService } from './appointments/appointments.service';
import { PublicController } from './appointments/public.controller';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/guards';
import { AvailabilityService } from './availability/availability.service';
import { CatalogService } from './catalog/catalog.service';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { IdempotencyService } from './idempotency/idempotency.service';
import { NotificationsService } from './notifications/notifications.service';
import { PoliciesService } from './policies/policies.service';

export const DOMAIN_PROVIDERS = [
  CatalogService,
  PoliciesService,
  AvailabilityService,
  NotificationsService,
  IdempotencyService,
  AppointmentsService,
];

@Module({
  imports: [DbModule, AuthModule],
  controllers: [HealthController, PublicController, AdminAppointmentsController, AdminCatalogController],
  providers: [...DOMAIN_PROVIDERS, { provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}

/** Worker dùng chung nghiệp vụ nhưng không mở cổng HTTP. */
@Module({
  imports: [DbModule],
  providers: DOMAIN_PROVIDERS,
})
export class WorkerModule {}
