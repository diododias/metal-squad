import { describe, expect, it } from 'vitest';
import {
  createWebAuth,
  isAllowedHostHeader,
  isAllowedOrigin,
  parseCookies,
  timingSafeEqualStrings,
  SESSION_COOKIE_NAME,
} from '../../src/web/auth.js';

describe('timingSafeEqualStrings', () => {
  it('compares strings of any length without throwing', () => {
    expect(timingSafeEqualStrings('secret', 'secret')).toBe(true);
    expect(timingSafeEqualStrings('secret', 'wrong')).toBe(false);
    expect(timingSafeEqualStrings('', 'longer-than-the-other')).toBe(false);
    expect(timingSafeEqualStrings('', '')).toBe(true);
  });
});

describe('parseCookies', () => {
  it('parses a cookie header into a record', () => {
    expect(parseCookies('a=1; msq_session=abc; b=2')).toEqual({ a: '1', msq_session: 'abc', b: '2' });
  });

  it('handles missing or malformed headers', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('no-equals-sign')).toEqual({});
  });
});

describe('isAllowedHostHeader', () => {
  it('accepts loopback names and the bound host, with or without port', () => {
    expect(isAllowedHostHeader('127.0.0.1:8743', '127.0.0.1')).toBe(true);
    expect(isAllowedHostHeader('localhost:8743', '127.0.0.1')).toBe(true);
    expect(isAllowedHostHeader('localhost', '127.0.0.1')).toBe(true);
    expect(isAllowedHostHeader('[::1]:8743', '127.0.0.1')).toBe(true);
    expect(isAllowedHostHeader('192.168.0.10:8743', '192.168.0.10')).toBe(true);
  });

  it('rejects foreign hosts (DNS rebinding) and missing headers', () => {
    expect(isAllowedHostHeader('evil.example:8743', '127.0.0.1')).toBe(false);
    expect(isAllowedHostHeader('evil.example', '127.0.0.1')).toBe(false);
    expect(isAllowedHostHeader(undefined, '127.0.0.1')).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('allows absent Origin (non-browser clients)', () => {
    expect(isAllowedOrigin(undefined, '127.0.0.1')).toBe(true);
  });

  it('allows same-host browser origins', () => {
    expect(isAllowedOrigin('http://127.0.0.1:8743', '127.0.0.1')).toBe(true);
    expect(isAllowedOrigin('http://localhost:8743', '127.0.0.1')).toBe(true);
  });

  it('rejects cross-site and non-http origins', () => {
    expect(isAllowedOrigin('http://evil.example', '127.0.0.1')).toBe(false);
    expect(isAllowedOrigin('https://evil.example:8743', '127.0.0.1')).toBe(false);
    expect(isAllowedOrigin('file://', '127.0.0.1')).toBe(false);
    expect(isAllowedOrigin('null', '127.0.0.1')).toBe(false);
  });
});

describe('createWebAuth', () => {
  it('redeems a ticket exactly once', () => {
    const auth = createWebAuth();
    const ticket = auth.issueLoginTicket();
    expect(auth.redeemLoginTicket(ticket)).toBe(true);
    expect(auth.redeemLoginTicket(ticket)).toBe(false);
    expect(auth.redeemLoginTicket('unknown')).toBe(false);
  });

  it('expires tickets after their TTL', () => {
    let now = 1_000;
    const auth = createWebAuth(() => now);
    const ticket = auth.issueLoginTicket(60_000);
    now += 61_000;
    expect(auth.redeemLoginTicket(ticket)).toBe(false);
  });

  it('validates sessions from the cookie header', () => {
    const auth = createWebAuth();
    const sessionId = auth.createSession();
    expect(auth.hasValidSession(`${SESSION_COOKIE_NAME}=${sessionId}`)).toBe(true);
    expect(auth.hasValidSession(`${SESSION_COOKIE_NAME}=forged`)).toBe(false);
    expect(auth.hasValidSession(undefined)).toBe(false);
  });

  it('serializes a hardened session cookie', () => {
    const auth = createWebAuth();
    const cookie = auth.sessionCookie('abc');
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=abc`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
  });
});
