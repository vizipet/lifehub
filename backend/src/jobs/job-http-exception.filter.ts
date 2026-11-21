import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { JobExecutionError } from './job-execution.error';

@Catch()
export class JobHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'JOB_EXECUTION_FAILED';
    if (exception instanceof JobExecutionError) {
      if (exception.code === 'INVALID_JOB' || exception.code === 'INVALID_JOB_BATCH_SIZE') {
        status = HttpStatus.BAD_REQUEST;
        code = exception.code;
      } else if (exception.code === 'JOB_UNAVAILABLE') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = exception.code;
      }
    } else if (exception instanceof HttpException) {
      const httpStatus = exception.getStatus();
      if (httpStatus === HttpStatus.BAD_REQUEST) {
        status = httpStatus;
        code = 'JOB_REQUEST_INVALID';
      } else if (httpStatus === HttpStatus.UNAUTHORIZED) {
        status = httpStatus;
        code = 'JOB_AUTH_REQUIRED';
      } else if (httpStatus === HttpStatus.SERVICE_UNAVAILABLE) {
        status = httpStatus;
        code = 'JOB_SERVICE_UNAVAILABLE';
      }
    }

    // Do not include exception messages, request URLs, headers, or provider data.
    host.switchToHttp().getResponse<Response>()
      .setHeader('Cache-Control', 'no-store')
      .status(status)
      .json({ statusCode: status, code });
  }
}
