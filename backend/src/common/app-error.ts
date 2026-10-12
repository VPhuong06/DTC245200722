import { HttpException, HttpStatus } from '@nestjs/common';

/** Lỗi nghiệp vụ trả về client theo định dạng thống nhất { error: { code, message, request_id } }. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);

export const notFound = (message = 'Không tìm thấy dữ liệu') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);

export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
