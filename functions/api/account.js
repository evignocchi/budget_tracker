import { json, errorResponse, readJson } from './_lib/http.js';
import { getSession, verifyPassword, clearSessionCookieHeader } from './_lib/auth.js';

export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const body = await readJson(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return errorResponse('Password obbligatoria per confermare l\'eliminazione');

  const valid = await verifyPassword(password, session.password_salt, session.password_hash);
  if (!valid) return errorResponse('Password errata', 401);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(session.id),
    env.DB.prepare('DELETE FROM categories WHERE user_id = ?').bind(session.id),
    env.DB.prepare('DELETE FROM accounts WHERE user_id = ?').bind(session.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(session.id),
  ]);

  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}
