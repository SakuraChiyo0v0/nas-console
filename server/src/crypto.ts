import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

/** scrypt 哈希密码，存库格式：scrypt:N:r:p:salt:hash（hex） */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, salt, hashHex] = parts;
  const n = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!n || !r || !p) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, r, p });
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 生成 URL 安全随机 token（API Key 等） */
export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

/** 生成随机会话 id */
export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** token 脱敏展示：nas-console 列表里只显示前缀 + …，完整值可单独查询 */
export function maskToken(token: string): string {
  if (token.length <= 10) return "***";
  return token.slice(0, 10) + "…";
}