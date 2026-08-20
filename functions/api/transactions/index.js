import { json, errorResponse, readJson } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = ['settimanale', 'mensile', 'annuale'];

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const categoryId = url.searchParams.get('category_id');
  const accountId = url.searchParams.get('account_id');
  const type = url.searchParams.get('type');

  const conditions = ['t.user_id = ?'];
  const bindings = [session.id];

  if (from && ISO_DATE_RE.test(from)) {
    conditions.push('t.date >= ?');
    bindings.push(from);
  }
  if (to && ISO_DATE_RE.test(to)) {
    conditions.push('t.date <= ?');
    bindings.push(to);
  }
  if (categoryId) {
    conditions.push('t.category_id = ?');
    bindings.push(categoryId);
  }
  if (accountId) {
    conditions.push('t.account_id = ?');
    bindings.push(accountId);
  }
  if (type === 'income' || type === 'expense') {
    conditions.push('t.type = ?');
    bindings.push(type);
  }

  const query = `
    SELECT t.id, t.date, t.amount, t.type, t.description, t.is_recurring, t.recurrence_frequency,
           t.category_id, c.name AS category_name, t.account_id, a.name AS account_name
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    JOIN accounts a ON a.id = t.account_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC, t.created_at DESC
  `;

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ transactions: results });
}

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

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

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO transactions (id, user_id, date, amount, type, category_id, account_id, description, is_recurring, recurrence_frequency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    session.id,
    date,
    numAmount,
    type,
    category_id,
    account_id,
    typeof description === 'string' ? description.trim() : null,
    recurring ? 1 : 0,
    frequency
  ).run();

  return json({ transaction: { id } }, { status: 201 });
}
