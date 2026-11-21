import { Inject, Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { Agent, request } from 'node:https';
import type { RequestOptions } from 'node:https';
import { checkServerIdentity } from 'node:tls';

export const SOURCE_DNS_RESOLVER = Symbol('SOURCE_DNS_RESOLVER');
export const SOURCE_HTTPS_REQUEST = Symbol('SOURCE_HTTPS_REQUEST');
export interface SourceAddress { address: string; family: 4 | 6 }

export function sourceHeadOptions(url: URL, target: SourceAddress, signal: AbortSignal, agent: Agent): RequestOptions {
  return {
    protocol: 'https:', hostname: target.address, port: 443, family: target.family,
    servername: url.hostname, path: `${url.pathname}${url.search}`, method: 'HEAD',
    headers: { Host: url.hostname, 'User-Agent': 'LifeHub-Source-Check/1.0', Connection: 'close' },
    agent, signal, maxHeaderSize: 8192, rejectUnauthorized: true,
    checkServerIdentity: (_hostname, certificate) => checkServerIdentity(url.hostname, certificate),
  };
}

@Injectable()
export class SourceNetworkService {
  constructor(
    @Inject(SOURCE_DNS_RESOLVER) private readonly createResolver: () => Resolver,
    @Inject(SOURCE_HTTPS_REQUEST) private readonly send: typeof request,
  ) {}

  async resolve(host: string, signal: AbortSignal): Promise<SourceAddress[]> {
    signal.throwIfAborted();
    const resolver = this.createResolver();
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const results = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
      signal.throwIfAborted();
      const addresses: SourceAddress[] = [];
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          addresses.push(...result.value.map((address) => ({ address, family: index === 0 ? 4 as const : 6 as const })));
        } else {
          const error: unknown = result.reason;
          // Native resolver errors may come from a different JavaScript realm.
          if (typeof error !== 'object' || error === null || !('code' in error) ||
              typeof error.code !== 'string' || !['ENODATA', 'ENOTFOUND'].includes(error.code)) {
            throw new Error('SOURCE_DNS_FAILED');
          }
        }
      }
      return addresses;
    } finally { signal.removeEventListener('abort', cancel); }
  }

  async head(url: URL, target: SourceAddress, signal: AbortSignal): Promise<number> {
    signal.throwIfAborted();
    // Dedicated agent: no proxy environment, shared sockets, cookies, retries or redirects.
    const agent = new Agent({ keepAlive: false, maxSockets: 1, proxyEnv: {} });
    try {
      return await new Promise<number>((resolve, reject) => {
        const req = this.send(sourceHeadOptions(url, target, signal, agent), (response) => {
          response.on('error', () => undefined);
          resolve(response.statusCode ?? 0);
          response.destroy(); // HEAD only; never download or parse source content.
          req.destroy();
        });
        req.on('error', reject);
        req.end();
      });
    } finally { agent.destroy(); }
  }
}

export const sourceNetworkProviders = [
  { provide: SOURCE_DNS_RESOLVER, useValue: () => new Resolver({ timeout: 1500, tries: 1 }) },
  { provide: SOURCE_HTTPS_REQUEST, useValue: request },
];
