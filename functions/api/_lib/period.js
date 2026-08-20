function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function quarterRange(year, quarterIndex) {
  const startMonth = quarterIndex * 3;
  const endMonth = startMonth + 2;
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, endMonth, lastDayOfMonth(year, endMonth)));
  return { from: toISODate(from), to: toISODate(to) };
}

function halfRange(year, halfIndex) {
  const startMonth = halfIndex * 6;
  const endMonth = startMonth + 5;
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, endMonth, lastDayOfMonth(year, endMonth)));
  return { from: toISODate(from), to: toISODate(to) };
}

function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Restituisce { from, to } (ISO YYYY-MM-DD) per un periodo predefinito, e il periodo
 * immediatamente precedente della stessa lunghezza, utile per i confronti.
 */
export function getPeriodRange(period, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const currentQuarter = Math.floor(month / 3);
  const currentHalf = Math.floor(month / 6);

  switch (period) {
    case 'current_quarter':
      return quarterRange(year, currentQuarter);
    case 'previous_quarter': {
      const q = currentQuarter - 1;
      return q < 0 ? quarterRange(year - 1, 3) : quarterRange(year, q);
    }
    case 'current_half':
      return halfRange(year, currentHalf);
    case 'previous_half': {
      const h = currentHalf - 1;
      return h < 0 ? halfRange(year - 1, 1) : halfRange(year, h);
    }
    case 'current_year':
      return yearRange(year);
    case 'previous_year':
      return yearRange(year - 1);
    default:
      return yearRange(year);
  }
}

/** Periodo precedente della stessa durata, usato per i confronti. */
export function getPreviousPeriodRange(period, now = new Date()) {
  switch (period) {
    case 'current_quarter':
      return getPeriodRange('previous_quarter', now);
    case 'current_half':
      return getPeriodRange('previous_half', now);
    case 'current_year':
      return getPeriodRange('previous_year', now);
    case 'previous_quarter': {
      const year = now.getUTCFullYear();
      const q = Math.floor(now.getUTCMonth() / 3) - 2;
      return q < 0 ? quarterRange(year - 1, q + 4) : quarterRange(year, q);
    }
    case 'previous_half': {
      const year = now.getUTCFullYear();
      const h = Math.floor(now.getUTCMonth() / 6) - 2;
      return h < 0 ? halfRange(year - 1, h + 2) : halfRange(year, h);
    }
    case 'previous_year':
      return yearRange(now.getUTCFullYear() - 2);
    default:
      return getPeriodRange('previous_year', now);
  }
}

export { toISODate };
