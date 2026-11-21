import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { CronSecretGuard } from './cron-secret.guard';
import { JobHttpExceptionFilter } from './job-http-exception.filter';
import { JobsService } from './jobs.service';
import { RunJobRequestPipe } from './run-job-request.pipe';
import type { RunJobRequest } from './run-job-request.pipe';

@ApiExcludeController()
@Controller('internal/jobs')
@UseGuards(CronSecretGuard)
@UseFilters(JobHttpExceptionFilter)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post(':job/run')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async run(
    @Param('job') job: string,
    @Body(RunJobRequestPipe) body: RunJobRequest,
    @Req() request: Request,
  ) {
    if (Object.keys(request.query).length > 0) {
      throw new BadRequestException();
    }
    return { data: await this.jobs.run(job, body.batchSize) };
  }
}
