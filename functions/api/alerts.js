import { json, errorResponse } from './_lib/http.js';
import { getSession } from './_lib/auth.js';
import { toISODate } from './_lib/period.js';

const OVERSPEND_THRESHOLD = 1.2; // 20% oltre la media dei 3 mesi precedenti
const RECURRING_LOOKAHEAD_DAYS = 7;

function addInterval(date, frequency) {
  const d = new Date(date.getTime());
  if (frequency === 'settimanale') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'mensile') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (frequency === 'annuale') d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const now = new Date();
  const today = toISODate(now);
  const currentMonthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const historyStart = toISODate(threeMonthsAgo);

  const alerts = [];

  // 1. Spesa per categoria nel mese corrente vs media degli ultimi 3 mesi.
  const { results: currentMonthByCategory } = await env.DB.prepare(
    `SELECT c.id AS category_id, c.name AS category_name, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
     GROUP BY c.id`
  ).bind(session.id, currentMonthStart, today).all();

  const { results: historyByCategory } = await env.DB.prepare(
    `SELECT c.id AS category_id, c.name AS category_name, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date < ?
     GROUP BY c.id`
  ).bind(session.id, historyStart, currentMonthStart).all();

  const historyMap = new Map(historyByCategory.map((r) => [r.category_id, r.total]));

  for (const row of currentMonthByCategory) {
    const historyTotal = historyMap.get(row.category_id) || 0;
    const average = historyTotal / 3;
    if (average > 0 && row.total > average * OVERSPEND_THRESHOLD) {
      alerts.push({
        type: 'overspend',
        category_id: row.category_id,
        category_name: row.category_name,
        current_month_total: row.total,
        average_previous_months: Math.round(average * 100) / 100,
        message: `Hai speso ${row.total.toFixed(2)} € in "${row.category_name}" questo mese, contro una media di ${average.toFixed(2)} € nei mesi precedenti.`,
      });
    }
  }

  // 2. Spese ricorrenti in scadenza nei prossimi giorni.
  const { results: recurring } = await env.DB.prepare(
    `SELECT t.category_id, c.name AS category_name, t.description, t.amount, t.recurrence_frequency, MAX(t.date) AS last_date
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.is_recurring = 1
     GROUP BY t.category_id, t.description, t.recurrence_frequency`
  ).bind(session.id).all();

  const todayDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lookahead = new Date(todayDateOnly.getTime());
  lookahead.setUTCDate(lookahead.getUTCDate() + RECURRING_LOOKAHEAD_DAYS);

  for (const row of recurring) {
    const lastDate = new Date(`${row.last_date}T00:00:00Z`);
    const nextDate = addInterval(lastDate, row.recurrence_frequency);
    if (nextDate >= todayDateOnly && nextDate <= lookahead) {
      alerts.push({
        type: 'recurring_due',
        category_id: row.category_id,
        category_name: row.category_name,
        description: row.description,
        amount: row.amount,
        next_date: toISODate(nextDate),
        message: `Spesa ricorrente "${row.description || row.category_name}" prevista il ${toISODate(nextDate)} (${row.amount.toFixed(2)} €).`,
      });
    }
  }

  alerts.sort((a, b) => (a.type === b.type ? 0 : a.type === 'recurring_due' ? -1 : 1));

  return json({ alerts });
}
