import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const status =
      error.code === 'P2025'
        ? HttpStatus.NOT_FOUND
        : ['P2002', 'P2003', 'P2034'].includes(error.code)
          ? HttpStatus.CONFLICT
          : error.code === 'P2028'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      status === 404
        ? 'Record not found'
        : status === 409
          ? 'Operation conflicts with existing data'
          : status === 503
            ? 'Database busy; retry shortly'
            : 'Internal server error';
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
