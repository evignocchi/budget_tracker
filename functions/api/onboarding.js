import { json, errorResponse, readJson } from './_lib/http.js';
import { getSession } from './_lib/auth.js';

const DEFAULT_CATEGORIES = [
  { name: 'Stipendio', type: 'income' },
  { name: 'Affitto', type: 'expense' },
  { name: 'Spesa', type: 'expense' },
  { name: 'Trasporti', type: 'expense' },
  { name: 'Bollette', type: 'expense' },
  { name: 'Svago', type: 'expense' },
  { name: 'Salute', type: 'expense' },
  { name: 'Altro', type: 'expense' },
];

const FREQUENCIES = ['settimanale', 'mensile', 'annuale'];

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return errorResponse('Non autenticato', 401);

  const body = await readJson(request);
  if (!body) return errorResponse('JSON non valido');

  const initialBalance = Number(body.initial_balance);
  if (!Number.isFinite(initialBalance)) return errorResponse('Saldo iniziale non valido');

  const hasSalary = !!body.has_salary;
  let salaryAmount = null;
  let salaryFrequency = null;
  if (hasSalary) {
    salaryAmount = Number(body.salary_amount);
    salaryFrequency = body.salary_frequency;
    if (!Number.isFinite(salaryAmount) || salaryAmount <= 0) return errorResponse('Importo stipendio non valido');
    if (!FREQUENCIES.includes(salaryFrequency)) return errorResponse('Frequenza stipendio non valida');
  }

  await env.DB.prepare(
    `UPDATE users SET initial_balance = ?, has_salary = ?, salary_amount = ?, salary_frequency = ?, onboarding_completed = 1 WHERE id = ?`
  ).bind(initialBalance, hasSalary ? 1 : 0, salaryAmount, salaryFrequency, session.id).run();

  await env.DB.prepare('INSERT OR IGNORE INTO accounts (id, user_id, name) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), session.id, 'Conto principale')
    .run();

  const categoryStatements = DEFAULT_CATEGORIES.map((cat) =>
    env.DB.prepare('INSERT OR IGNORE INTO categories (id, user_id, name, type) VALUES (?, ?, ?, ?)').bind(
      crypto.randomUUID(),
      session.id,
      cat.name,
      cat.type
    )
  );
  await env.DB.batch(categoryStatements);

  return json({ ok: true });
}
