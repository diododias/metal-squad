const SERVICE = 'metal-squad';

/**
 * Guarda segredos no keychain do OS (@napi-rs/keyring).
 * Fallback headless (AES-256-GCM em arquivo) — TODO.
 */
export async function setSecret(account: string, value: string): Promise<void> {
  const { Entry } = await import('@napi-rs/keyring');
  new Entry(SERVICE, account).setPassword(value);
}

export async function getSecret(account: string): Promise<string | null> {
  const { Entry } = await import('@napi-rs/keyring');
  try {
    return new Entry(SERVICE, account).getPassword();
  } catch {
    return null; // TODO: tentar fallback cifrado
  }
}
