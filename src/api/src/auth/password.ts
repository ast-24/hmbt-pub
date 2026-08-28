import { verify as verifyArgon2, hash as hashArgon2 } from "@node-rs/argon2";

export async function hashPassword(password: string): Promise<string> {
  return hashArgon2(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verifyArgon2(passwordHash, password);
  } catch {
    return false;
  }
}
