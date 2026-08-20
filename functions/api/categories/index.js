import { json, errorResponse, readJson } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const { results } = await env.DB.prepare(
    'SELECT id, name, type FROM categories WHERE user_id = ? ORDER BY type ASC, name ASC'
  ).bind(session.id).all();

  return json({ categories: results });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const body = await readJson(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const type = body?.type;
  if (!name) return errorResponse('Il nome della categoria è obbligatorio');
  if (type !== 'income' && type !== 'expense') return errorResponse('Tipo categoria non valido');

  const existing = await env.DB.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ? AND type = ?')
    .bind(session.id, name, type)
    .first();
  if (existing) return errorResponse('Esiste già una categoria con questo nome e tipo', 409);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO categories (id, user_id, name, type) VALUES (?, ?, ?, ?)')
    .bind(id, session.id, name, type)
    .run();

  return json({ category: { id, name, type } }, { status: 201 });
}
