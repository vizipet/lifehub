import { EventEmitter } from 'node:events';
import type { Resolver } from 'node:dns/promises';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { Agent } from 'node:https';
import type { request, RequestOptions } from 'node:https';
import type { DetailedPeerCertificate } from 'node:tls';
import { runInNewContext } from 'node:vm';
import { sourceHeadOptions, SourceNetworkService } from './source-network.service';

describe('SourceNetworkService - transporte controlado', () => {
  it('fixa IP/porta/Host/SNI, mantém validação TLS e não envia autenticação', () => {
    const agent = new Agent({ proxyEnv: {} });
    try {
      const options = sourceHeadOptions(new URL('https://www.gov.br/pt-br?q=1'),
        { address: '8.8.8.8', family: 4 }, new AbortController().signal, agent);
      expect(options).toMatchObject({ hostname: '8.8.8.8', port: 443, family: 4,
        servername: 'www.gov.br', path: '/pt-br?q=1', method: 'HEAD',
        rejectUnauthorized: true, maxHeaderSize: 8192, agent });
      expect(options.headers).toEqual({ Host: 'www.gov.br', 'User-Agent': 'LifeHub-Source-Check/1.0', Connection: 'close' });
      expect(options.checkServerIdentity).toEqual(expect.any(Function));
      const valid = { subjectaltname: 'DNS:www.gov.br' } as DetailedPeerCertificate;
      const wrong = { subjectaltname: 'DNS:other.invalid' } as DetailedPeerCertificate;
      expect(options.checkServerIdentity?.('8.8.8.8', valid)).toBeUndefined();
      // Native TLS errors can originate outside Jest's VM realm. Check the rejection code.
      expect(options.checkServerIdentity?.('8.8.8.8', wrong)).toMatchObject({
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      });
    } finally { agent.destroy(); }
  });

  it('consulta A e AAAA e aceita família sem registros', async () => {
    const resolve4 = jest.fn().mockResolvedValue(['8.8.8.8']);
    const resolve6 = jest.fn().mockRejectedValue(Object.assign(new Error('no records'), { code: 'ENODATA' }));
    const cancel = jest.fn();
    const service = new SourceNetworkService(() => ({ resolve4, resolve6, cancel }) as unknown as Resolver,
      jest.fn() as unknown as typeof request);
    expect(await service.resolve('www.gov.br', new AbortController().signal)).toEqual([{ address: '8.8.8.8', family: 4 }]);
    expect(resolve4).toHaveBeenCalledWith('www.gov.br');
    expect(resolve6).toHaveBeenCalledWith('www.gov.br');
    expect(cancel).not.toHaveBeenCalled();
  });
  it('reconhece ausência de registros DNS em erro de outro contexto JavaScript', async () => {
    // Fixed test fixture only; no remote or user-provided code is evaluated.
    const foreignError: unknown = runInNewContext('Object.assign(new Error("no records"), { code: "ENODATA" })');
    const resolve4 = jest.fn().mockResolvedValue(['8.8.8.8']);
    const resolve6 = jest.fn().mockRejectedValue(foreignError);
    const service = new SourceNetworkService(() => ({ resolve4, resolve6, cancel: jest.fn() }) as unknown as Resolver,
      jest.fn() as unknown as typeof request);
    expect(await service.resolve('www.gov.br', new AbortController().signal)).toEqual([{ address: '8.8.8.8', family: 4 }]);
  });
  it('falha fechada quando uma das famílias retorna erro inesperado', async () => {
    const service = new SourceNetworkService(() => ({
      resolve4: async () => ['8.8.8.8'], resolve6: async () => { throw new Error('SERVFAIL'); },
      cancel: () => undefined,
    }) as unknown as Resolver, jest.fn() as unknown as typeof request);
    await expect(service.resolve('www.gov.br', new AbortController().signal)).rejects.toThrow('SOURCE_DNS_FAILED');
  });
  it('cancelamento interrompe as consultas do resolver', async () => {
    const abort = new AbortController();
    let reject4!: (reason: unknown) => void;
    let reject6!: (reason: unknown) => void;
    const cancel = jest.fn(() => { reject4(new Error('cancelled')); reject6(new Error('cancelled')); });
    const service = new SourceNetworkService(() => ({
      resolve4: () => new Promise((_, reject) => { reject4 = reject; }),
      resolve6: () => new Promise((_, reject) => { reject6 = reject; }), cancel,
    }) as unknown as Resolver, jest.fn() as unknown as typeof request);
    const pending = service.resolve('www.gov.br', abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('envia uma única HEAD e fecha resposta e socket sem consumir conteúdo', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 302, destroy: jest.fn() });
    const req = Object.assign(new EventEmitter(), { destroy: jest.fn(), end: jest.fn() });
    let options!: RequestOptions;
    const send = jest.fn((value: RequestOptions, callback: (value: IncomingMessage) => void) => {
      options = value;
      req.end.mockImplementation(() => callback(response as unknown as IncomingMessage));
      return req as unknown as ClientRequest;
    });
    const service = new SourceNetworkService(jest.fn(), send as unknown as typeof request);
    expect(await service.head(new URL('https://www.gov.br/'), { address: '8.8.8.8', family: 4 }, new AbortController().signal)).toBe(302);
    expect(send).toHaveBeenCalledTimes(1);
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(req.destroy).toHaveBeenCalledTimes(1);
    expect(options.hostname).toBe('8.8.8.8');
    expect(options.method).toBe('HEAD');
  });
});
