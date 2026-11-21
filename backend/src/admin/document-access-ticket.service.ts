import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';

const AUDIENCE = 'lifehub:verification-document';
const ISSUER = 'lifehub:g53';
export const DOCUMENT_ACCESS_TTL_SECONDS = 60;

interface DocumentTicket {
  purpose: 'verification-document';
  sub: string;
  sid: string;
  documentId: string;
  grantId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class DocumentAccessTicketService {
  private readonly jwt: JwtService;

  constructor(config: ConfigService) {
    // Chave derivada exclusiva deste propósito; não emite JWT de login e não
    // altera o AuthModule. Tickets não servem como credencial Bearer da API.
    const secret = createHmac('sha256', config.getOrThrow<string>('JWT_ACCESS_SECRET'))
      .update('lifehub:g53:document-ticket:v1').digest('hex');
    this.jwt = new JwtService({
      secret,
      signOptions: {
        algorithm: 'HS256', expiresIn: DOCUMENT_ACCESS_TTL_SECONDS,
        audience: AUDIENCE, issuer: ISSUER,
      },
    });
  }

  issue(actorId: string, sessionId: string, documentId: string, grantId: string) {
    return this.jwt.sign({ purpose: 'verification-document', sub: actorId, sid: sessionId, documentId, grantId });
  }

  verify(token: string, actorId: string, sessionId: string, documentId: string) {
    try {
      const payload = this.jwt.verify<DocumentTicket>(token, {
        algorithms: ['HS256'], audience: AUDIENCE, issuer: ISSUER, maxAge: '60s',
      });
      if (payload.purpose !== 'verification-document' || payload.sub !== actorId ||
          payload.sid !== sessionId || payload.documentId !== documentId ||
          typeof payload.grantId !== 'string' || !payload.grantId ||
          typeof payload.iat !== 'number' || typeof payload.exp !== 'number' ||
          payload.exp - payload.iat !== DOCUMENT_ACCESS_TTL_SECONDS) {
        throw new Error('invalid document ticket');
      }
      return payload.grantId;
    } catch {
      throw new UnauthorizedException({
        code: 'DOCUMENT_ACCESS_INVALID_OR_EXPIRED',
        message: 'O acesso ao documento é inválido ou expirou. Solicite um novo link.',
      });
    }
  }
}
