import { json, errorResponse, readJson } from '../_lib/http.js';
import { verifyPassword, createSession, sessionCookieHeader, publicUser } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorResponse('JSON non valido');

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return errorResponse('Email e password sono obbligatorie');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) return errorResponse('Credenziali non valide', 401);

  const valid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!valid) return errorResponse('Credenziali non valide', 401);

  const session = await createSession(env, user.id);
  return json(
    { user: publicUser(user) },
    { headers: { 'Set-Cookie': sessionCookieHeader(session.id, session.maxAgeSeconds) } }
  );
}
