import { BlockList, isIP } from 'node:net';

const deniedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) deniedV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const deniedV6 = new BlockList();
// Conservative exclusions: protocol assignments, documentation and transition ranges.
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) deniedV6.addSubnet(address, prefix, 'ipv6');

export function isPublicSourceAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !deniedV4.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !deniedV6.check(address, 'ipv6');
  return false;
}

export function parseSourceUrl(value: string): URL | null {
  // Reject normalization tricks, credentials and nonstandard ports. No IP-literal URLs.
  if (value.length > 2048 || value !== value.trim() || /[\s\\]/.test(value) ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    const host = url.hostname;
    const labels = host.split('.');
    if (isIP(host.replace(/^\[|\]$/g, '')) || host.length > 253 || labels.length < 2 ||
        labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
        ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion', 'arpa']
          .some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    return url;
  } catch { return null; }
}
