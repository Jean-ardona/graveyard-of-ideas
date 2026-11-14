import { LIMITS } from './schema';

const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export const INVALID_LINK_MESSAGE = 'Links must be valid http or https addresses.';

/** Failure shape shared by every domain function that accepts links. */
export type InvalidLinkFailure = { ok: false; error: 'invalid_link'; message: string };

export const invalidLink: InvalidLinkFailure = { ok: false, error: 'invalid_link', message: INVALID_LINK_MESSAGE };

/**
 * True only for a non-empty string that, after trimming, is a valid http: or https: URL
 * within the length limit. javascript:, data:, vbscript:, ftp: and anything unparsable are rejected.
 * This is the single gate for every link entering the data.
 */
export function isSafeLink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > LIMITS.link) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}
