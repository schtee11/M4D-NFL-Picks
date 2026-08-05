// Lightweight auth for a small private league: "join with a name + PIN".
// No third-party auth. Sessions are a signed cookie (HMAC-SHA256) carrying the
// user id; PINs are salted+hashed with scrypt.

import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "./db";

const COOKIE = "m4d_session";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

// ── PIN hashing ──────────────────────────────────────────────────────────────
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pin, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Signed session token ─────────────────────────────────────────────────────
function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function makeToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  if (sign(payload) !== sig) return null;
  const [userId] = payload.split(".");
  return userId || null;
}

export function setSessionCookie(userId: string) {
  cookies().set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export function getSessionUserId(): string | null {
  return readToken(cookies().get(COOKIE)?.value);
}

export async function getCurrentUser() {
  const id = getSessionUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export function handleFor(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, " ");
}
