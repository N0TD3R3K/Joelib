const encoder = new TextEncoder();
const PBKDF2_PHASES = [100_000, 100_000, 10_000] as const;

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

function phaseSalt(salt: Uint8Array, phase: number): Uint8Array {
  const label = encoder.encode(`:joese-password-v1:${phase}`);
  const value = new Uint8Array(salt.length + label.length);
  value.set(salt);
  value.set(label, salt.length);
  return value;
}

async function derivePasswordPhase(
  secret: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, saltBase64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  let derived: Uint8Array<ArrayBuffer> = encoder.encode(password);
  for (const [index, iterations] of PBKDF2_PHASES.entries()) {
    derived = await derivePasswordPhase(derived, phaseSalt(salt, index + 1), iterations);
  }
  return { hash: bytesToBase64(derived), salt: bytesToBase64(salt) };
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

