import { json, errorResponse, readJson } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = ['settimanale', 'mensile', 'annuale'];

export async function onRequestPut({ request, env, params }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const existing = await env.DB.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?')
    .bind(params.id, session.id)
    .first();
  if (!existing) return errorResponse('Transazione non trovata', 404);

  const body = await readJson(request);
  if (!body) return errorResponse('JSON non valido');

  const { date, amount, type, category_id, account_id, description, is_recurring, recurrence_frequency } = body;

  if (!ISO_DATE_RE.test(date || '')) return errorResponse('Data non valida (attesa YYYY-MM-DD)');
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) return errorResponse('Importo non valido');
  if (type !== 'income' && type !== 'expense') return errorResponse('Tipo non valido');
  if (!category_id || !account_id) return errorResponse('Categoria e conto sono obbligatori');

  const recurring = !!is_recurring;
  let frequency = null;
  if (recurring) {
    if (!FREQUENCIES.includes(recurrence_frequency)) return errorResponse('Frequenza di ricorrenza non valida');
    frequency = recurrence_frequency;
  }

  const category = await env.DB.prepare('SELECT id, type FROM categories WHERE id = ? AND user_id = ?')
    .bind(category_id, session.id)
    .first();
  if (!category) return errorResponse('Categoria non valida', 400);
  if (category.type !== type) return errorResponse('Il tipo della categoria non corrisponde al tipo della transazione', 400);

  const account = await env.DB.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
    .bind(account_id, session.id)
    .first();
  if (!account) return errorResponse('Conto non valido', 400);

  await env.DB.prepare(
    `UPDATE transactions SET date = ?, amount = ?, type = ?, category_id = ?, account_id = ?, description = ?, is_recurring = ?, recurrence_frequency = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    date,
    numAmount,
    type,
    category_id,
    account_id,
    typeof description === 'string' ? description.trim() : null,
    recurring ? 1 : 0,
    frequency,
    params.id,
    session.id
  ).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const existing = await env.DB.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?')
    .bind(params.id, session.id)
    .first();
  if (!existing) return errorResponse('Transazione non trovata', 404);

  await env.DB.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').bind(params.id, session.id).run();
  return json({ ok: true });
}
