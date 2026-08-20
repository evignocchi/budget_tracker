import { json } from '../_lib/http.js';
import { getSessionToken, clearSessionCookieHeader } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  }
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}
