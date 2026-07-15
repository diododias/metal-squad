import { networkInterfaces } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createWebAuth,
  isAllowedHostHeader,
  isAllowedOrigin,
  parseCookies,
  timingSafeEqualStrings,
  SESSION_COOKIE_NAME,
} from '../../src/web/auth.js';

function firstLanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (!addr.internal && addr.family === 'IPv4') return addr.address;
    }
  }
  return null;
}

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

  it('accepts this machine\'s LAN addresses when bound to a wildcard host (H22)', () => {
    const lanAddress = firstLanAddress();
    if (!lanAddress) return; // no non-loopback interface in this environment
    expect(isAllowedHostHeader(`${lanAddress}:8743`, '0.0.0.0')).toBe(true);
    expect(isAllowedHostHeader(`${lanAddress}:8743`, '::')).toBe(true);
  });

  it('accepts mDNS and Tailscale MagicDNS suffixes when bound to a wildcard host (H22)', () => {
    expect(isAllowedHostHeader('my-mac.local:8743', '0.0.0.0')).toBe(true);
    expect(isAllowedHostHeader('my-mac.tailabc123.ts.net:8743', '0.0.0.0')).toBe(true);
  });

  it('still rejects foreign hosts (DNS rebinding) when bound to a wildcard host', () => {
    expect(isAllowedHostHeader('evil.example:8743', '0.0.0.0')).toBe(false);
  });

  it('does not treat the literal wildcard string as a match when bound to a specific host', () => {
    expect(isAllowedHostHeader('0.0.0.0:8743', '127.0.0.1')).toBe(false);
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

  it('accepts LAN/mDNS/Tailscale MagicDNS Origins when bound to a wildcard host (H22)', () => {
    const lanAddress = firstLanAddress();
    if (lanAddress) expect(isAllowedOrigin(`http://${lanAddress}:8743`, '0.0.0.0')).toBe(true);
    expect(isAllowedOrigin('http://my-mac.tailabc123.ts.net:8743', '0.0.0.0')).toBe(true);
  });

  it('still rejects foreign and non-http origins when bound to a wildcard host', () => {
    expect(isAllowedOrigin('http://evil.example', '0.0.0.0')).toBe(false);
    expect(isAllowedOrigin('file://', '0.0.0.0')).toBe(false);
  });
});

describe('createWebAuth', () => {
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

  it('invalidates a session so it no longer authenticates', () => {
    const auth = createWebAuth();
    const sessionId = auth.createSession();
    expect(auth.hasValidSession(`${SESSION_COOKIE_NAME}=${sessionId}`)).toBe(true);

    auth.invalidateSession(`${SESSION_COOKIE_NAME}=${sessionId}`);

    expect(auth.hasValidSession(`${SESSION_COOKIE_NAME}=${sessionId}`)).toBe(false);
  });

  it('does not throw when invalidating a missing or forged session', () => {
    const auth = createWebAuth();
    expect(() => { auth.invalidateSession(undefined); }).not.toThrow();
    expect(() => { auth.invalidateSession(`${SESSION_COOKIE_NAME}=forged`); }).not.toThrow();
  });

  it('serializes a cookie that clears the session in the browser', () => {
    const auth = createWebAuth();
    const cookie = auth.expiredSessionCookie();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain('Max-Age=0');
  });
});
