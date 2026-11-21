import { isPublicSourceAddress, parseSourceUrl } from './source-url.policy';

describe('Política de destino de fontes', () => {
  it.each([
    'http://www.gov.br/', 'file:///etc/passwd', 'https://localhost/', 'https://x.local/',
    'https://intranet/', 'https://x.internal/', 'https://example.test/', 'https://x.invalid/',
    'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://169.254.169.254/',
    'https://www.gov.br:8443/', 'https://user:password@www.gov.br/',
    'https://www.gov.br/#fragment', 'https://www.gov.br./',
    ' https://www.gov.br/', 'https://www.gov.br/\n', 'https://www.gov.br\\@localhost/',
    'https://-broken.gov.br/', 'not-a-url', `https://www.gov.br/${'a'.repeat(2048)}`,
  ])('bloqueia URL insegura antes de DNS: %s', (value) => {
    expect(parseSourceUrl(value)).toBeNull();
  });
  it('preserva caminho e query HTTPS públicos sem exigir sufixo governamental', () => {
    const url = parseSourceUrl('https://www.gov.br:443/pt-br?item=1');
    expect(url?.hostname).toBe('www.gov.br');
    expect(url?.pathname).toBe('/pt-br');
    expect(url?.search).toBe('?item=1');
  });
  it.each([
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.1.1.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.0.0.9', '192.0.2.1', '192.88.99.1',
    '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1',
    '255.255.255.255', '::', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fd00::1',
    'fe80::1', 'ff02::1', '64:ff9b::a00:1', '2001::1', '2001:db8::1',
    '2002:7f00:1::1', '3fff::1', 'not-an-ip',
  ])('rejeita endereço privado, reservado ou de transição: %s', (address) => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'aceita endereço global fora das exclusões: %s', (address) => {
      expect(isPublicSourceAddress(address)).toBe(true);
    },
  );
});
