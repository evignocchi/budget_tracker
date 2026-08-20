const SESSION_COOKIE = 'session';
const SESSION_DURATION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHashHex);
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  return [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`].join('; ');
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createSession(env, userId) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(id, userId, expiresAt).run();
  return { id, expiresAt, maxAgeSeconds: SESSION_DURATION_DAYS * 24 * 60 * 60 };
}

export function getSessionToken(request) {
  return parseCookies(request)[SESSION_COOKIE] || null;
}

export async function getSession(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.session_expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return null;
  }
  return row;
}

export function publicUser(userRow) {
  return {
    id: userRow.id,
    email: userRow.email,
    initial_balance: userRow.initial_balance,
    has_salary: !!userRow.has_salary,
    salary_amount: userRow.salary_amount,
    salary_frequency: userRow.salary_frequency,
    onboarding_completed: !!userRow.onboarding_completed,
  };
}
