import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'msq_session';
export const LOGIN_TICKET_TTL_MS = 10 * 60 * 1000;
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

/** Rejects requests whose Host header points at a hostname other than the
 * loopback names or the configured bind host — a DNS-rebinding page resolves
 * an attacker domain to 127.0.0.1, so the Host header betrays it. */
export function isAllowedHostHeader(hostHeader: string | undefined, boundHost: string): boolean {
  if (!hostHeader) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return false;
  }
  const normalized = normalizeHostname(hostname);
  return LOCAL_HOSTNAMES.has(normalized) || normalized === normalizeHostname(boundHost);
}

/** Browser-sent Origin must match one of the allowed hostnames; an absent
 * Origin means a non-browser client and is allowed (auth still applies). */
export function isAllowedOrigin(originHeader: string | undefined, boundHost: string): boolean {
  if (originHeader === undefined) return true;
  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const normalized = normalizeHostname(url.hostname);
  return LOCAL_HOSTNAMES.has(normalized) || normalized === normalizeHostname(boundHost);
}

export interface WebAuth {
  /** Mints a single-use login ticket for the /auth URL. */
  issueLoginTicket: (ttlMs?: number) => string;
  /** Consumes a ticket; returns false if unknown, already used, or expired. */
  redeemLoginTicket: (ticket: string) => boolean;
  /** Creates a session and returns its id (the cookie value). */
  createSession: () => string;
  /** True when the Cookie header carries a live session id. */
  hasValidSession: (cookieHeader: string | undefined) => boolean;
  /** Serialized Set-Cookie value for a session id. */
  sessionCookie: (sessionId: string) => string;
}

export function createWebAuth(now: () => number = Date.now): WebAuth {
  const tickets = new Map<string, number>();
  const sessions = new Map<string, number>();

  function sweepTickets(): void {
    const current = now();
    for (const [ticket, expiresAt] of tickets) {
      if (expiresAt <= current) tickets.delete(ticket);
    }
  }

  return {
    issueLoginTicket(ttlMs = LOGIN_TICKET_TTL_MS): string {
      sweepTickets();
      const ticket = randomBytes(32).toString('hex');
      tickets.set(ticket, now() + ttlMs);
      return ticket;
    },
    redeemLoginTicket(ticket: string): boolean {
      sweepTickets();
      for (const [stored, expiresAt] of tickets) {
        if (timingSafeEqualStrings(stored, ticket)) {
          tickets.delete(stored);
          return expiresAt > now();
        }
      }
      return false;
    },
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
    sessionCookie(sessionId: string): string {
      return `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${String(SESSION_COOKIE_MAX_AGE_SECONDS)}`;
    },
  };
}
