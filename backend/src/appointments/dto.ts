import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { STATUSES, Status } from './appointments.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CustomerDto {
  @IsString()
  @MinLength(2, { message: 'Vui lòng nhập họ tên' })
  @MaxLength(100)
  fullName: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(200)
  email?: string | null;
}

export class CreateAppointmentDto {
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsUUID('all')
  serviceId: string;

  /** Bỏ trống hoặc null = "Nhân viên bất kỳ". */
  @IsOptional()
  @IsUUID('all')
  staffId?: string | null;

  /** Ngày hẹn theo giờ Việt Nam, dạng YYYY-MM-DD. */
  @Matches(DATE, { message: 'Ngày hẹn phải có dạng YYYY-MM-DD' })
  date: string;

  /** Giờ bắt đầu, dạng HH:mm. */
  @Matches(TIME, { message: 'Giờ bắt đầu phải có dạng HH:mm' })
  time: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Khách đồng ý chính sách quyền riêng tư (bắt buộc với đặt lịch trực tuyến). */
  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}

export class RescheduleDto {
  @IsOptional()
  @IsUUID('all')
  serviceId?: string;

  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  @Matches(DATE, { message: 'Ngày hẹn phải có dạng YYYY-MM-DD' })
  date: string;

  @Matches(TIME, { message: 'Giờ bắt đầu phải có dạng HH:mm' })
  time: string;
}

export class CancelDto {
  @IsString()
  @MinLength(3, { message: 'Vui lòng nhập lý do hủy (tối thiểu 3 ký tự)' })
  @MaxLength(300)
  reason: string;
}

export class LookupDto {
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  code: string;

  @IsString()
  @MaxLength(20)
  phone: string;
}

export class LookupCancelDto extends LookupDto {
  @IsString()
  @MinLength(3, { message: 'Vui lòng nhập lý do hủy (tối thiểu 3 ký tự)' })
  @MaxLength(300)
  reason: string;
}

export class LookupRescheduleDto extends LookupDto {
  @Matches(DATE, { message: 'Ngày hẹn phải có dạng YYYY-MM-DD' })
  date: string;

  @Matches(TIME, { message: 'Giờ bắt đầu phải có dạng HH:mm' })
  time: string;
}

export class LookupAvailabilityDto extends LookupDto {
  @Matches(DATE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  date: string;
}

export class AvailabilityQuery {
  @IsUUID('all')
  serviceId: string;

  @Matches(DATE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  date: string;

  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  /** Chỉ dùng ở trang quản trị khi đổi lịch: bỏ qua chính lịch đang đổi. */
  @IsOptional()
  @IsUUID('all')
  excludeAppointmentId?: string;
}

export class ListQuery {
  @Matches(DATE)
  from: string;

  @Matches(DATE)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID('all')
  serviceId?: string;

  @IsOptional()
  @IsUUID('all')
  staffId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;
}
