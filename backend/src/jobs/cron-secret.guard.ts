import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const EXPIRATION_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface CronSecrets {
  current: string;
  previous?: string;
  previousExpiresAt?: number;
}

function isSecret(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && SECRET_PATTERN.test(value);
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === '';
}

function digest(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secrets = this.readSecrets();
    const request = context.switchToHttp().getRequest<Request>();
    let authorizationCount = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index].toLowerCase() === 'authorization') {
        authorizationCount += 1;
      }
    }

    const authorization = request.headers.authorization;
    if (authorizationCount !== 1 || typeof authorization !== 'string') {
      throw new UnauthorizedException();
    }
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/i.exec(authorization);
    if (!match || match[0] !== authorization) {
      throw new UnauthorizedException();
    }

    const received = digest(match[1]);
    // Fixed-size digests avoid length-dependent timingSafeEqual exceptions.
    // Evaluate both comparisons before deciding whether either key is accepted.
    const matchesCurrent = timingSafeEqual(received, digest(secrets.current));
    const matchesPrevious = timingSafeEqual(
      received,
      digest(secrets.previous ?? secrets.current),
    );
    const previousActive = secrets.previous !== undefined &&
      secrets.previousExpiresAt !== undefined &&
      Date.now() < secrets.previousExpiresAt;

    if (!matchesCurrent && !(previousActive && matchesPrevious)) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private readSecrets(): CronSecrets {
    const current = this.config.get<unknown>('CRON_SECRET');
    const previous = this.config.get<unknown>('CRON_SECRET_PREVIOUS');
    const expiresAt = this.config.get<unknown>('CRON_SECRET_PREVIOUS_EXPIRES_AT');
    if (!isSecret(current)) {
      throw new ServiceUnavailableException();
    }
    if (isAbsent(previous) && isAbsent(expiresAt)) {
      return { current };
    }
    if (
      !isSecret(previous) || previous === current ||
      typeof expiresAt !== 'string' || !EXPIRATION_PATTERN.test(expiresAt)
    ) {
      throw new ServiceUnavailableException();
    }
    const expiration = Date.parse(expiresAt);
    if (!Number.isFinite(expiration) || new Date(expiration).toISOString() !== expiresAt) {
      throw new ServiceUnavailableException();
    }
    return { current, previous, previousExpiresAt: expiration };
  }
}
