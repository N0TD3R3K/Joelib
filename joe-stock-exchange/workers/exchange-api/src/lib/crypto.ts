const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function hashSessionToken(token: string, secret: string): Promise<string> {
  return sha256(`${secret}:${token}`);
}

export async function hashPassword(password: string, saltBase64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 210_000 },
    key,
    256,
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const candidate = await hashPassword(password, salt);
  if (candidate.hash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.hash.length; index += 1) {
    difference |= candidate.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

