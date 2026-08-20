import { json, errorResponse } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const category = await env.DB.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?')
    .bind(params.id, session.id)
    .first();
  if (!category) return errorResponse('Categoria non trovata', 404);

  const inUse = await env.DB.prepare('SELECT 1 FROM transactions WHERE category_id = ? AND user_id = ? LIMIT 1')
    .bind(params.id, session.id)
    .first();
  if (inUse) return errorResponse('Impossibile eliminare: la categoria ha transazioni associate', 409);

  await env.DB.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(params.id, session.id).run();
  return json({ ok: true });
}
