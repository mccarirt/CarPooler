// Pure scheduling logic: no Firebase, no React. Dates are local 'YYYY-MM-DD' strings,
// times are 'HH:MM' (24h), weekdays are ISO numbers (Mon=1 ... Sun=7).

export type Stop = { label: string; time: string; kidIds: string[] };
export type Leg = {
  direction: 'AM' | 'PM';
  days: number[]; // recurring weekdays; ignored when `date` is set
  date?: string; // one fixed date instead of recurring
  startDate: string; // recurring legs begin counting on this date
  windowStart: string;
  windowEnd: string;
  stops: Stop[];
  driverMode: 'rotation' | 'fixed';
  fixedUid?: string;
  rotationOffset: number; // staggers legs so AM and PM don't land on the same parent
};
// A per-day change to one leg (Phase 4 swaps will set driverUid here).
export type Override = { skip?: boolean; windowStart?: string; windowEnd?: string; note?: string; driverUid?: string };
// A circle-wide change to a whole day (holiday, no practice).
export type DayInfo = { skip?: boolean; note?: string };

export type Overrides = Record<string, Override>; // key: `${legId}_${date}`
export type Days = Record<string, DayInfo>;

export const overrideKey = (legId: string, date: string) => `${legId}_${date}`;

// ---------- dates ----------
export function toISO(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
export function fromISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function isoWeekday(s: string) {
  const w = fromISO(s).getDay(); // 0=Sun
  return w === 0 ? 7 : w;
}
export function mondayOf(s: string) {
  return addDays(s, 1 - isoWeekday(s));
}
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function prettyDate(s: string) {
  const d = fromISO(s);
  return `${WEEKDAY_LONG[isoWeekday(s) - 1]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
export function shortDate(s: string) {
  const d = fromISO(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---------- times ----------
// Accepts "7:40", "740", "7:40am", "2:45 pm", "14:45". Returns 'HH:MM' or null.
export function parseTime(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3];
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer.startsWith('p') && h < 12) h += 12;
    if (mer.startsWith('a') && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ---------- which legs run when ----------
export function runsOn(leg: Leg, date: string) {
  if (leg.date) return leg.date === date;
  return date >= leg.startDate && leg.days.includes(isoWeekday(date));
}

export function isSkipped(legId: string, date: string, overrides: Overrides, days: Days) {
  return !!days[date]?.skip || !!overrides[overrideKey(legId, date)]?.skip;
}

export function effectiveWindow(legId: string, leg: Leg, date: string, overrides: Overrides) {
  const o = overrides[overrideKey(legId, date)];
  return { start: o?.windowStart ?? leg.windowStart, end: o?.windowEnd ?? leg.windowEnd };
}

// Rotation order = the stored order (minus people who left) + anyone new, in join order.
export function resolveRotation(stored: string[] | undefined, memberUids: string[]) {
  const set = new Set(memberUids);
  const kept = (stored ?? []).filter((u) => set.has(u));
  return [...kept, ...memberUids.filter((u) => !kept.includes(u))];
}

// Who drives `leg` on `date`. A skipped day does not use up anyone's turn.
export function driverFor(
  legId: string,
  leg: Leg,
  date: string,
  rotation: string[],
  overrides: Overrides,
  days: Days,
): string | null {
  const o = overrides[overrideKey(legId, date)];
  if (o?.driverUid) return o.driverUid;
  if (leg.driverMode === 'fixed') return leg.fixedUid ?? null;
  if (rotation.length === 0) return null;
  let turns = 0;
  if (leg.date) {
    turns = 0;
  } else {
    for (let d = leg.startDate; d < date; d = addDays(d, 1)) {
      if (runsOn(leg, d) && !isSkipped(legId, d, overrides, days)) turns++;
    }
  }
  return rotation[(turns + leg.rotationOffset) % rotation.length];
}

// Fairness: Day 1 is simply 1 leg = 1 credit. Counts every scheduled, non-skipped
// leg from its start through `today`. (Weighting is a later decision.)
export function fairness(
  legs: Record<string, Leg>,
  rotation: string[],
  overrides: Overrides,
  days: Days,
  today: string,
): Record<string, number> {
  const score: Record<string, number> = Object.fromEntries(rotation.map((u) => [u, 0]));
  for (const [legId, leg] of Object.entries(legs)) {
    const first = leg.date ?? leg.startDate;
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (!runsOn(leg, d) || isSkipped(legId, d, overrides, days)) continue;
      const who = driverFor(legId, leg, d, rotation, overrides, days);
      if (who) score[who] = (score[who] ?? 0) + 1;
    }
  }
  return score;
}
