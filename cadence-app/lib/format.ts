// Ported from cadence-prototype/js/data.js — pure formatting/date helpers,
// unchanged in behavior from the prototype.

export function addDays(d: Date | string, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addWeeks(d: Date | string, n: number): Date {
  return addDays(d, n * 7);
}

export function atTime(d: Date | string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

export function startOfWeek(d: Date | string): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtShort(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtStamp(d: Date | string): string {
  return `${fmtShort(d)} ${fmtTime(d)}`;
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
