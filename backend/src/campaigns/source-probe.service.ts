import { Injectable } from '@nestjs/common';
import { SourceNetworkService } from './source-network.service';
import { isPublicSourceAddress, parseSourceUrl } from './source-url.policy';

export const SOURCE_PROBE_TIMEOUT_MS = 4000;
export const SOURCE_FAILURES = ['URL_BLOCKED', 'DNS_FAILED', 'TIMEOUT', 'NETWORK_FAILED', 'HTTP_ERROR', 'REDIRECT'] as const;
export type SourceFailure = typeof SOURCE_FAILURES[number];
export type SourceProbeResult = { available: true } | { available: false; failure: SourceFailure };

@Injectable()
export class SourceProbeService {
  constructor(private readonly network: SourceNetworkService) {}

  async check(value: string): Promise<SourceProbeResult> {
    const url = parseSourceUrl(value);
    if (!url) return { available: false, failure: 'URL_BLOCKED' };
    const abort = new AbortController();
    let phase: 'DNS_FAILED' | 'NETWORK_FAILED' = 'DNS_FAILED';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<SourceProbeResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({ available: false, failure: 'TIMEOUT' });
        abort.abort();
      }, SOURCE_PROBE_TIMEOUT_MS);
    });
    try {
      const probe = async (): Promise<SourceProbeResult> => {
        try {
          const addresses = await this.network.resolve(url.hostname, abort.signal);
          if (abort.signal.aborted) return { available: false, failure: 'TIMEOUT' };
          if (addresses.length === 0) return { available: false, failure: 'DNS_FAILED' };
          // Reject the entire DNS set if it contains any private/reserved answer.
          if (addresses.length > 64 || addresses.some((target) => !isPublicSourceAddress(target.address))) {
            return { available: false, failure: 'URL_BLOCKED' };
          }
          phase = 'NETWORK_FAILED';
          const status = await this.network.head(url, addresses[0], abort.signal);
          if (abort.signal.aborted) return { available: false, failure: 'TIMEOUT' };
          if (status >= 200 && status < 300) return { available: true };
          return { available: false, failure: status >= 300 && status < 400 ? 'REDIRECT' : 'HTTP_ERROR' };
        } catch {
          return { available: false, failure: abort.signal.aborted ? 'TIMEOUT' : phase };
        }
      };
      return await Promise.race([probe(), deadline]);
    } finally { clearTimeout(timer); }
  }
}
