import { json, errorResponse, readJson } from '../_lib/http.js';
import { hashPassword, createSession, sessionCookieHeader, publicUser } from '../_lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorResponse('JSON non valido');

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !EMAIL_RE.test(email)) return errorResponse('Email non valida');
  if (password.length < 8) return errorResponse('La password deve avere almeno 8 caratteri');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return errorResponse('Email già registrata', 409);

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)'
  ).bind(id, email, hash, salt).run();

  const session = await createSession(env, id);
  return json(
    {
      user: publicUser({
        id,
        email,
        initial_balance: 0,
        has_salary: 0,
        salary_amount: null,
        salary_frequency: null,
        onboarding_completed: 0,
      }),
    },
    { headers: { 'Set-Cookie': sessionCookieHeader(session.id, session.maxAgeSeconds) } }
  );
}
