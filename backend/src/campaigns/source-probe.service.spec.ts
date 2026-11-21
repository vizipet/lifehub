import { SourceNetworkService } from './source-network.service';
import { SourceProbeService, SOURCE_PROBE_TIMEOUT_MS } from './source-probe.service';

describe('SourceProbeService - DNS/TLS substituídos', () => {
  const resolve = jest.fn();
  const head = jest.fn();
  let probe: SourceProbeService;
  beforeEach(() => {
    jest.resetAllMocks();
    resolve.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    head.mockResolvedValue(200);
    probe = new SourceProbeService({ resolve, head } as unknown as SourceNetworkService);
  });
  afterEach(() => jest.useRealTimers());

  it('não resolve nem conecta uma URL bloqueada', async () => {
    expect(await probe.check('https://127.0.0.1/')).toEqual({ available: false, failure: 'URL_BLOCKED' });
    expect(resolve).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });
  it.each(['10.0.0.1', '::1', '::ffff:127.0.0.1', '169.254.169.254'])(
    'rejeita DNS misto contendo %s sem abrir conexão', async (address) => {
      resolve.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address, family: 6 }]);
      expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'URL_BLOCKED' });
      expect(head).not.toHaveBeenCalled();
    },
  );
  it('usa somente o IP já validado, sem nova resolução por tentativa', async () => {
    expect(await probe.check('https://www.gov.br/pt-br')).toEqual({ available: true });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(head).toHaveBeenCalledTimes(1);
    expect(head).toHaveBeenCalledWith(expect.any(URL), { address: '8.8.8.8', family: 4 }, expect.any(AbortSignal));
  });
  it.each([200, 204, 299])('reconhece disponibilidade HTTP %s', async (status) => {
    head.mockResolvedValue(status);
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: true });
  });
  it.each([301, 302, 307, 308])('sinaliza redirecionamento %s sem seguir Location', async (status) => {
    head.mockResolvedValue(status);
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'REDIRECT' });
    expect(head).toHaveBeenCalledTimes(1);
  });
  it.each([0, 401, 403, 404, 405, 429, 500, 501])('sinaliza HTTP %s sem retry/GET', async (status) => {
    head.mockResolvedValue(status);
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'HTTP_ERROR' });
    expect(head).toHaveBeenCalledTimes(1);
  });
  it('trata conjunto DNS vazio como indisponível', async () => {
    resolve.mockResolvedValue([]);
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'DNS_FAILED' });
    expect(head).not.toHaveBeenCalled();
  });
  it('não devolve detalhes privados de DNS ou TLS', async () => {
    resolve.mockRejectedValue(new Error('sensitive DNS details'));
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'DNS_FAILED' });
    resolve.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    head.mockRejectedValue(new Error('certificate sensitive details'));
    expect(await probe.check('https://www.gov.br/')).toEqual({ available: false, failure: 'NETWORK_FAILED' });
  });
  it('limita DNS lento e impede conexão quando a resolução chega atrasada', async () => {
    jest.useFakeTimers();
    let complete!: (value: unknown) => void;
    resolve.mockImplementation(() => new Promise((done) => { complete = done; }));
    const pending = probe.check('https://www.gov.br/');
    await jest.advanceTimersByTimeAsync(SOURCE_PROBE_TIMEOUT_MS);
    expect(await pending).toEqual({ available: false, failure: 'TIMEOUT' });
    complete([{ address: '8.8.8.8', family: 4 }]);
    await Promise.resolve();
    expect(head).not.toHaveBeenCalled();
  });
  it('aborta uma conexão lenta pelo prazo total', async () => {
    jest.useFakeTimers();
    head.mockImplementation(() => new Promise(() => undefined));
    const pending = probe.check('https://www.gov.br/');
    await jest.advanceTimersByTimeAsync(SOURCE_PROBE_TIMEOUT_MS);
    expect(await pending).toEqual({ available: false, failure: 'TIMEOUT' });
    expect(head.mock.calls[0][2].aborted).toBe(true);
  });
});
