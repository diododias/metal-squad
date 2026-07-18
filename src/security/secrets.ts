import { logCaughtError } from '../core/events/logging.js';

const SERVICE = 'metal-squad';

/**
 * Guarda segredos no keychain do OS (@napi-rs/keyring).
 * Fallback headless (AES-256-GCM em arquivo) — TODO.
 */
export async function setSecret(account: string, value: string): Promise<void> {
  const { Entry } = await import('@napi-rs/keyring');
  new Entry(SERVICE, account).setPassword(value);
}

/** Removes a secret from the OS keychain without reading or exposing its value. */
export async function clearSecret(account: string): Promise<void> {
  const { Entry } = await import('@napi-rs/keyring');
  new Entry(SERVICE, account).deletePassword();
}

export async function getSecret(account: string): Promise<string | null> {
  const { Entry } = await import('@napi-rs/keyring');
  try {
    return new Entry(SERVICE, account).getPassword();
  } catch (error) {
    logCaughtError(`security/secrets.getSecret(${account})`, error);
    return null; // TODO: tentar fallback cifrado
  }
}
