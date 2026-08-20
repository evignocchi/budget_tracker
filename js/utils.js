// Conversione date: DB usa ISO (YYYY-MM-DD), l'utente vede/inserisce DD-MM-YYYY.
function toISO(ddmmyyyy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((ddmmyyyy || '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function toDisplay(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate || '').trim());
  if (!m) return isoDate || '';
  const [, yyyy, mm, dd] = m;
  return `${dd}-${mm}-${yyyy}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDisplay() {
  return toDisplay(todayISO());
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
