import { json, errorResponse, readJson } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const { results } = await env.DB.prepare(
    'SELECT id, name, created_at FROM accounts WHERE user_id = ? ORDER BY created_at ASC'
  ).bind(session.id).all();

  return json({ accounts: results });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const body = await readJson(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return errorResponse('Il nome del conto è obbligatorio');

  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE user_id = ? AND name = ?')
    .bind(session.id, name)
    .first();
  if (existing) return errorResponse('Esiste già un conto con questo nome', 409);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO accounts (id, user_id, name) VALUES (?, ?, ?)').bind(id, session.id, name).run();

  return json({ account: { id, name } }, { status: 201 });
}
