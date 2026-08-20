import { json, errorResponse } from './_lib/http.js';
import { getSession } from './_lib/auth.js';
import { getPeriodRange, getPreviousPeriodRange } from './_lib/period.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PERIODS = ['current_quarter', 'previous_quarter', 'current_half', 'previous_half', 'current_year', 'previous_year', 'custom'];

async function computeAggregates(env, userId, from, to, categoryId, accountId) {
  const conditions = ['user_id = ?', 'date >= ?', 'date <= ?'];
  const tConditions = ['t.user_id = ?', 't.date >= ?', 't.date <= ?'];
  const bindings = [userId, from, to];
  if (categoryId) {
    conditions.push('category_id = ?');
    tConditions.push('t.category_id = ?');
    bindings.push(categoryId);
  }
  if (accountId) {
    conditions.push('account_id = ?');
    tConditions.push('t.account_id = ?');
    bindings.push(accountId);
  }
  const where = conditions.join(' AND ');
  const tWhere = tConditions.join(' AND ');

  const totalsQuery = env.DB.prepare(
    `SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions WHERE ${where} GROUP BY type`
  ).bind(...bindings);

  const byCategoryQuery = env.DB.prepare(
    `SELECT c.id AS category_id, c.name AS category_name, c.type, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE ${tWhere}
     GROUP BY c.id ORDER BY total DESC`
  ).bind(...bindings);

  const byMonthQuery = env.DB.prepare(
    `SELECT strftime('%Y-%m', date) AS month, type, COALESCE(SUM(amount), 0) AS total
     FROM transactions WHERE ${where} GROUP BY month, type ORDER BY month ASC`
  ).bind(...bindings);

  const [totalsRes, byCategoryRes, byMonthRes] = await Promise.all([
    totalsQuery.all(),
    byCategoryQuery.all(),
    byMonthQuery.all(),
  ]);

  let income = 0;
  let expense = 0;
  for (const row of totalsRes.results) {
    if (row.type === 'income') income = row.total;
    if (row.type === 'expense') expense = row.total;
  }

  const monthsMap = new Map();
  for (const row of byMonthRes.results) {
    if (!monthsMap.has(row.month)) monthsMap.set(row.month, { month: row.month, income: 0, expense: 0 });
    monthsMap.get(row.month)[row.type] = row.total;
  }

  return {
    income,
    expense,
    net: income - expense,
    byCategory: byCategoryRes.results,
    byMonth: Array.from(monthsMap.values()),
  };
}

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'current_year';
  const categoryId = url.searchParams.get('category_id') || null;
  const accountId = url.searchParams.get('account_id') || null;
  const compare = url.searchParams.get('compare') === '1';
  const customFrom = url.searchParams.get('from');
  const customTo = url.searchParams.get('to');

  if (!VALID_PERIODS.includes(period)) return errorResponse('Periodo non valido');

  let range;
  if (period === 'custom') {
    if (!customFrom || !customTo || !ISO_DATE_RE.test(customFrom) || !ISO_DATE_RE.test(customTo)) {
      return errorResponse('Intervallo date non valido');
    }
    range = { from: customFrom, to: customTo };
  } else {
    range = getPeriodRange(period);
  }

  const current = await computeAggregates(env, session.id, range.from, range.to, categoryId, accountId);

  let previous = null;
  if (compare && period !== 'custom') {
    const prevRange = getPreviousPeriodRange(period);
    previous = await computeAggregates(env, session.id, prevRange.from, prevRange.to, categoryId, accountId);
    previous.range = prevRange;
  }

  const balanceConditions = ['user_id = ?'];
  const balanceBindings = [session.id];
  if (accountId) {
    balanceConditions.push('account_id = ?');
    balanceBindings.push(accountId);
  }
  const netRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS net
     FROM transactions WHERE ${balanceConditions.join(' AND ')}`
  ).bind(...balanceBindings).first();

  const currentBalance = (session.initial_balance || 0) + (netRow?.net || 0);

  return json({
    range,
    current_balance: currentBalance,
    current,
    previous,
  });
}
