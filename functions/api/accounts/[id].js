import { json, errorResponse } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const account = await env.DB.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
    .bind(params.id, session.id)
    .first();
  if (!account) return errorResponse('Conto non trovato', 404);

  const inUse = await env.DB.prepare('SELECT 1 FROM transactions WHERE account_id = ? AND user_id = ? LIMIT 1')
    .bind(params.id, session.id)
    .first();
  if (inUse) return errorResponse('Impossibile eliminare: il conto ha transazioni associate', 409);

  await env.DB.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').bind(params.id, session.id).run();
  return json({ ok: true });
}
