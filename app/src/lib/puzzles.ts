import type { Level, Puzzle, PuzzleDB, PzRec } from './types';
import { chessAt, tryMove } from './chessutil';

export const PZ_KEY = 'cr-pz';
export const PZ_AUTO_KEY = 'cr-pz-auto';
const LEVELS: Level[] = ['easy', 'medium', 'hard'];

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickN<T extends { id: string }>(pool: T[], n: number, seed: number): T[] {
  const arr = pool.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rnd = mulberry32(seed >>> 0);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr.slice(0, n);
}

export function utcDate(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function prettyTheme(t: string) {
  return String(t).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function levelName(id: string) {
  return id === 'easy' ? 'Easy' : id === 'medium' ? 'Medium' : 'Hard';
}

type Store = { byDay: Record<string, Record<string, PzRec>> };

export function pzLoad(): Store {
  try {
    const o = JSON.parse(localStorage.getItem(PZ_KEY) || '{}') as Store;
    if (!o.byDay) o.byDay = {};
    return o;
  } catch {
    return { byDay: {} };
  }
}
export function pzSave(st: Store) {
  localStorage.setItem(PZ_KEY, JSON.stringify(st));
}
export function pzRec(date: string, id: string): PzRec | null {
  return (pzLoad().byDay[date] || {})[id] || null;
}
export function pzWrite(date: string, id: string, patch: Partial<PzRec>) {
  const st = pzLoad();
  if (!st.byDay[date]) st.byDay[date] = {};
  const prev = st.byDay[date][id] || { status: null, hint: 0 };
  const next: PzRec = {
    status: patch.status !== undefined ? patch.status : prev.status,
    hint: Math.max(prev.hint || 0, patch.hint || 0),
  };
  if (prev.status === 'solved') next.status = 'solved';
  st.byDay[date][id] = next;
  pzSave(st);
  return next;
}

export function dayList(db: PuzzleDB, date: string): Puzzle[] {
  return LEVELS.flatMap((level) => pickN(db.buckets[level] || [], 2, hashStr(date + ':' + level)).map((p) => ({ ...p, level })));
}

export function dayComplete(db: PuzzleDB | null, date: string) {
  if (!db) return false;
  const list = dayList(db, date);
  if (list.length < 6) return false;
  const recs = pzLoad().byDay[date] || {};
  return list.every((p) => recs[p.id] && recs[p.id].status === 'solved');
}

export function streak(db: PuzzleDB | null) {
  if (!db) return 0;
  const start = dayComplete(db, utcDate(0)) ? 0 : -1;
  if (start === -1 && !dayComplete(db, utcDate(-1))) return 0;
  let n = 0;
  for (let i = start; i > -400; i--) {
    if (!dayComplete(db, utcDate(i))) break;
    n++;
  }
  return n;
}

export function autoAdvanceOn() {
  return localStorage.getItem(PZ_AUTO_KEY) === '1';
}
export function setAutoAdvance(on: boolean) {
  localStorage.setItem(PZ_AUTO_KEY, on ? '1' : '0');
}

export function solutionSan(p: Puzzle) {
  const ch = chessAt(p.fen);
  const out: string[] = [];
  for (const u of p.solution) {
    const m = tryMove(ch, { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) break;
    out.push(m.san);
  }
  return out.join(' ');
}
