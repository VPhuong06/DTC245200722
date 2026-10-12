import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../auth/actor';
import { AuthGuard, CurrentActor, Roles } from '../auth/guards';
import { AppointmentsService } from '../appointments/appointments.service';
import { AvailabilityQuery, CancelDto, CreateAppointmentDto, ListQuery, RescheduleDto } from '../appointments/dto';
import { AvailabilityService } from '../availability/availability.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

/** Điều phối lịch hẹn trong trang quản trị. Nhân viên chỉ xem và cập nhật lịch được phân công cho mình. */
@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard)
@Roles('admin', 'staff')
export class AdminAppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly availability: AvailabilityService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('appointments')
  list(@Query() q: ListQuery, @CurrentActor() actor: Actor) {
    return this.appointments.list(q, actor);
  }

  @Get('appointments/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.appointments.get(id, actor);
  }

  /** Tạo lịch hộ khách gọi điện hoặc đến trực tiếp. */
  @Post('appointments')
  @Roles('admin')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.run(`user:${actor.id}`, key, dto, async () => {
      const created = await this.appointments.create(dto, actor, 'admin');
      return this.appointments.get(created.id, actor);
    });
    res.status(result.status);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Post('appointments/:id/confirm')
  @HttpCode(200)
  @Roles('admin')
  async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.appointments.confirm(id, actor);
    return this.appointments.get(id, actor);
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  @Roles('admin')
  async reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto, @CurrentActor() actor: Actor) {
    await this.appointments.reschedule(id, dto, actor);
    return this.appointments.get(id, actor);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  @Roles('admin')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto, @CurrentActor() actor: Actor) {
    await this.appointments.cancel(id, actor, dto.reason);
    return this.appointments.get(id, actor);
  }

  @Post('appointments/:id/complete')
  @HttpCode(200)
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.appointments.complete(id, actor);
    return this.appointments.get(id, actor);
  }

  @Post('appointments/:id/no-show')
  @HttpCode(200)
  async noShow(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.appointments.noShow(id, actor);
    return this.appointments.get(id, actor);
  }

  /** Giờ trống cho form tạo/đổi lịch (không áp dụng đặt trước tối thiểu/tối đa). */
  @Get('availability')
  slots(@Query() q: AvailabilityQuery) {
    return this.availability.slots({
      serviceId: q.serviceId,
      date: q.date,
      staffId: q.staffId,
      excludeAppointmentId: q.excludeAppointmentId,
      forAdmin: true,
    });
  }
}
