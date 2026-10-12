import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMin: number;

  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceVnd: number;

  @IsBoolean()
  active: boolean;
}

export class WorkingHourDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(TIME)
  start: string;

  @Matches(TIME)
  end: string;
}

export class StaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsBoolean()
  active: boolean;

  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds: string[];

  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours: WorkingHourDto[];
}

export class PolicyDto {
  @IsInt()
  @Min(5)
  @Max(120)
  slotStepMin: number;

  @IsInt()
  @Min(0)
  @Max(10080)
  minAdvanceMin: number;

  @IsInt()
  @Min(1)
  @Max(365)
  maxAdvanceDays: number;

  @IsInt()
  @Min(5)
  @Max(10080)
  holdMin: number;

  @IsBoolean()
  autoConfirm: boolean;

  @IsInt()
  @Min(0)
  @Max(10080)
  changeDeadlineMin: number;

  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(10, { each: true })
  @Max(10080, { each: true })
  reminderOffsetsMin: number[];
}

export class HolidayDto {
  @Matches(DATE)
  day: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class TimeOffDto {
  @IsUUID('all')
  staffId: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CustomerQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class RangeQuery {
  @Matches(DATE)
  from: string;

  @Matches(DATE)
  to: string;
}
