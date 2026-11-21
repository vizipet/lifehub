import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DocumentAccessTicketService } from './document-access-ticket.service';

describe('DocumentAccessTicketService', () => {
  const secret = 'g53-ticket-unit-test-only-secret';
  const service = new DocumentAccessTicketService(new ConfigService({ JWT_ACCESS_SECRET: secret }));
  afterEach(() => { jest.useRealTimers(); });

  it('vincula ticket de 60 segundos ao autor, sessão, documento e concessão', () => {
    const ticket = service.issue('admin', 'session', 'document', 'grant');
    expect(service.verify(ticket, 'admin', 'session', 'document')).toBe('grant');
  });
  it.each([
    ['other-admin', 'session', 'document'], ['admin', 'other-session', 'document'],
    ['admin', 'session', 'other-document'],
  ])('recusa uso fora do vínculo %s/%s/%s', (actor, session, document) => {
    const ticket = service.issue('admin', 'session', 'document', 'grant');
    expect(() => service.verify(ticket, actor, session, document)).toThrow(UnauthorizedException);
  });
  it('recusa ticket expirado no limite de 60 segundos', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T12:00:00Z'));
    const ticket = service.issue('admin', 'session', 'document', 'grant');
    jest.advanceTimersByTime(60_000);
    expect(() => service.verify(ticket, 'admin', 'session', 'document')).toThrow(UnauthorizedException);
  });
  it.each(['invalid', ''])('recusa assinatura/conteúdo inválido: %s', (ticket) => {
    expect(() => service.verify(ticket, 'admin', 'session', 'document')).toThrow(UnauthorizedException);
  });
  it('JWT de login não funciona como ticket de documento', () => {
    const token = new JwtService({ secret }).sign({ sub: 'admin', sid: 'session', role: 'ADMIN', type: 'access' });
    expect(() => service.verify(token, 'admin', 'session', 'document')).toThrow(UnauthorizedException);
  });
  it('ticket de documento não funciona como JWT de login', () => {
    const ticket = service.issue('admin', 'session', 'document', 'grant');
    expect(() => new JwtService({ secret }).verify(ticket)).toThrow();
  });
});
