import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { logCaughtError } from '../core/events/logging.js';

export const SESSION_COOKIE_NAME = 'msq_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSIONS = 100;

/** Constant-time string comparison — hashes both sides to a fixed length so
 * timingSafeEqual can be used on attacker-controlled input of any size. */
export function timingSafeEqualStrings(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);

/** Hostname suffixes known to resolve only to addresses under the operator's
 * own control, never to an arbitrary attacker-registered domain: Tailscale's
 * MagicDNS (`*.ts.net`) and mDNS (`*.local`). Allowlisted only when bound to
 * a wildcard address, alongside the machine's own interface IPs — a request
 * still has to reach the process to matter, and these suffixes are the two
 * common non-IP ways a LAN/VPN client addresses this machine. */
const ALLOWED_WILDCARD_SUFFIXES = ['.ts.net', '.local'];

/** True when `boundHost` tells the HTTP server to listen on every interface —
 * the operator has opted into exposure beyond loopback (LAN, a VPN overlay
 * like Tailscale, etc). */
function isWildcardBindHost(boundHost: string): boolean {
  return WILDCARD_HOSTS.has(normalizeHostname(boundHost));
}

/** Hostnames (IPv4/IPv6, normalized) of every non-internal network interface
 * on this machine — computed lazily since interfaces don't change mid-run. */
function localInterfaceHostnames(): Set<string> {
  const hostnames = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (addr.internal) continue;
      hostnames.add(normalizeHostname(addr.address));
    }
  }
  return hostnames;
}

function isAllowedHostname(hostname: string, boundHost: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (LOCAL_HOSTNAMES.has(normalized) || normalized === normalizeHostname(boundHost)) return true;
  if (!isWildcardBindHost(boundHost)) return false;
  if (localInterfaceHostnames().has(normalized)) return true;
  return ALLOWED_WILDCARD_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/** Rejects requests whose Host header points at a hostname other than the
 * loopback names, the configured bind host, or — when bound to a wildcard
 * address (0.0.0.0/::) — one of this machine's own interface addresses or a
 * Tailscale/mDNS name for it. A DNS-rebinding page resolves an attacker
 * domain to 127.0.0.1 (or a LAN IP), so the Host header betrays it; an
 * arbitrary domain never matches an interface IP nor the `.ts.net`/`.local`
 * suffixes, so it's still rejected even on a wildcard bind. */
export function isAllowedHostHeader(hostHeader: string | undefined, boundHost: string): boolean {
  if (!hostHeader) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch (error) {
    logCaughtError('web/auth.isAllowedHostHeader', error);
    return false;
  }
  return isAllowedHostname(hostname, boundHost);
}

/** Browser-sent Origin must match one of the allowed hostnames; an absent
 * Origin means a non-browser client and is allowed (auth still applies). */
export function isAllowedOrigin(originHeader: string | undefined, boundHost: string): boolean {
  if (originHeader === undefined) return true;
  let url: URL;
  try {
    url = new URL(originHeader);
  } catch (error) {
    logCaughtError('web/auth.isAllowedOrigin', error);
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return isAllowedHostname(url.hostname, boundHost);
}

export interface WebAuth {
  /** Creates a session and returns its id (the cookie value). */
  createSession: () => string;
  /** True when the Cookie header carries a live session id. */
  hasValidSession: (cookieHeader: string | undefined) => boolean;
  /** Removes the session carried by the Cookie header, if any. */
  invalidateSession: (cookieHeader: string | undefined) => void;
  /** Serialized Set-Cookie value for a session id. */
  sessionCookie: (sessionId: string) => string;
  /** Serialized Set-Cookie value that clears the session cookie in the browser. */
  expiredSessionCookie: () => string;
}

export function createWebAuth(now: () => number = Date.now): WebAuth {
  const sessions = new Map<string, number>();

  return {
    createSession(): string {
      const sessionId = randomBytes(32).toString('hex');
      sessions.set(sessionId, now());
      if (sessions.size > MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined) sessions.delete(oldest);
      }
      return sessionId;
    },
    hasValidSession(cookieHeader: string | undefined): boolean {
      const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
      if (!sessionId) return false;
      for (const stored of sessions.keys()) {
        if (timingSafeEqualStrings(stored, sessionId)) return true;
      }
      return false;
    },
    invalidateSession(cookieHeader: string | undefined): void {
      const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
      if (!sessionId) return;
      for (const stored of sessions.keys()) {
        if (timingSafeEqualStrings(stored, sessionId)) sessions.delete(stored);
      }
    },
    sessionCookie(sessionId: string): string {
      return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${String(SESSION_COOKIE_MAX_AGE_SECONDS)}`;
    },
    expiredSessionCookie(): string {
      return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    },
  };
}
