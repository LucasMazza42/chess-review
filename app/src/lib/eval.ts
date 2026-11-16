import type { Color, Ev, Game, RMove } from './types';
import { chessAt, clamp, epd, legalMoves, tryMove } from './chessutil';
import { getBook } from './openings';

export const CLS = {
  brilliant: { name: 'Brilliant', sym: '!!', color: 'var(--brilliant)' },
  great: { name: 'Great', sym: '!', color: 'var(--great)' },
  best: { name: 'Best', sym: '★', color: 'var(--best)' },
  excellent: { name: 'Excellent', sym: '👍', color: 'var(--excellent)' },
  good: { name: 'Good', sym: '✓', color: 'var(--good)' },
  book: { name: 'Book', sym: '📖', color: 'var(--book)' },
  inaccuracy: { name: 'Inaccuracy', sym: '?!', color: 'var(--inaccuracy)' },
  mistake: { name: 'Mistake', sym: '?', color: 'var(--mistake)' },
  miss: { name: 'Miss', sym: '✗', color: 'var(--miss)' },
  blunder: { name: 'Blunder', sym: '??', color: 'var(--blunder)' },
} as const;

export type Cls = keyof typeof CLS;
export const CLS_ORDER: Cls[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

export const HL: Record<string, string> = {
  brilliant: 'rgba(38,194,163,.5)',
  great: 'rgba(116,155,191,.55)',
  best: 'rgba(129,182,76,.5)',
  excellent: 'rgba(129,182,76,.45)',
  good: 'rgba(149,183,118,.45)',
  book: 'rgba(213,164,125,.5)',
  inaccuracy: 'rgba(247,198,49,.5)',
  mistake: 'rgba(255,164,89,.55)',
  miss: 'rgba(255,119,105,.55)',
  blunder: 'rgba(250,65,45,.55)',
};

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function winWhite(ev: Ev | null | undefined) {
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : ev.mate < 0 ? 0 : ev.winner === 'w' ? 100 : 0;
  const cp = clamp(ev.cp ?? 0, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const winFor = (color: Color, ev: Ev | null | undefined) => (color === 'w' ? winWhite(ev) : 100 - winWhite(ev));

export function moveAccuracy(before: number, after: number) {
  if (after >= before) return 100;
  const d = before - after;
  return clamp(103.1668100711649 * Math.exp(-0.04354415386753951 * d) - 3.166924740191411 + 1, 0, 100);
}

function stdev(a: number[]) {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}

export function gameAccuracy(evals: (Ev | null)[], moves: RMove[]) {
  const wins = evals.map((e) => winWhite(e));
  const n = moves.length;
  if (!n) return { w: null as number | null, b: null as number | null };
  const ws = clamp(Math.floor(n / 10), 2, 8);
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(ws - 2, n); i++) windows.push(wins.slice(0, ws));
  for (let i = 0; i + ws <= wins.length && windows.length < n; i++) windows.push(wins.slice(i, i + ws));
  while (windows.length < n) windows.push(wins.slice(-ws));
  const weights = windows.map((w) => clamp(stdev(w), 0.5, 12));
  const res: { w: number | null; b: number | null } = { w: null, b: null };
  for (const c of ['w', 'b'] as const) {
    let wsumAcc = 0, wsum = 0, hs = 0, cnt = 0;
    moves.forEach((m, i) => {
      if (m.color !== c || m.acc == null) return;
      wsumAcc += m.acc * weights[i];
      wsum += weights[i];
      hs += 1 / Math.max(m.acc, 0.5);
      cnt++;
    });
    res[c] = cnt ? (wsumAcc / wsum + cnt / hs) / 2 : null;
  }
  return res;
}

export function evText(ev: Ev | null | undefined) {
  if (!ev) return '';
  if (ev.mate != null) return ev.mate === 0 ? (ev.winner ? (ev.winner === 'w' ? '1-0' : '0-1') : '') : 'M' + Math.abs(ev.mate);
  return (Math.abs(ev.cp ?? 0) / 100).toFixed(1);
}

export function evTextSigned(ev: Ev | null | undefined) {
  if (!ev) return '';
  if (ev.mate != null) return ev.mate === 0 ? (ev.winner === 'w' ? '1-0' : '0-1') : (ev.mate > 0 ? '+M' : '-M') + Math.abs(ev.mate);
  const cp = ev.cp ?? 0;
  return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
}

export function evShort(ev: Ev | null | undefined) {
  if (!ev) return '…';
  if (ev.mate != null) return ev.mate === 0 ? (ev.winner === 'w' ? '1-0' : '0-1') : (ev.mate > 0 ? '+M' : '−M') + Math.abs(ev.mate);
  const v = (ev.cp ?? 0) / 100;
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}

export function pvSan(fen: string, pv: string[] | undefined, n = 8) {
  const ch = chessAt(fen);
  const out: string[] = [];
  for (const u of (pv || []).slice(0, n)) {
    const m = tryMove(ch, { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) break;
    const f = ch.fen().split(' ');
    const moveNo = f[1] === 'b' ? +f[5] : +f[5] - 1;
    out.push(m.color === 'w' ? `${moveNo}. ${m.san}` : out.length === 0 ? `${moveNo}… ${m.san}` : m.san);
  }
  return out.join(' ');
}

export function uciToSan(fen: string, uci: string | null | undefined) {
  if (!uci) return '';
  const ch = chessAt(fen);
  const m = tryMove(ch, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return m ? m.san : uci;
}

function hangingSacrifice(fenBefore: string, m: RMove) {
  const ch = chessAt(fenBefore);
  const mv = tryMove(ch, { from: m.from, to: m.to, promotion: m.promotion || undefined });
  if (!mv) return false;
  const gained = mv.captured ? VAL[mv.captured] || 0 : 0;
  if (ch.isCheckmate()) return false;
  let worst = 0;
  for (const r of legalMoves(ch)) {
    if (!r.captured || (VAL[r.captured] || 0) < 3) continue;
    const ch2 = chessAt(ch.fen());
    if (!tryMove(ch2, { from: r.from, to: r.to, promotion: r.promotion })) continue;
    const recapture = legalMoves(ch2).some((x) => x.to === r.to);
    const net = (VAL[r.captured] || 0) - (recapture ? VAL[r.piece] || 0 : 0);
    worst = Math.max(worst, net);
  }
  return worst - gained >= 2;
}

export function classifyOne(
  m: RMove,
  before: Ev,
  after: Ev,
  fenBefore: string,
  ctx: { prev: RMove | null; plyIndex: number; isStd: boolean; fenAfter: string; legal: number },
) {
  const wb = winFor(m.color, before);
  const wa = winFor(m.color, after);
  m.loss = Math.max(0, wb - wa);
  m.acc = moveAccuracy(wb, wa);
  m.opening = null;
  const book = getBook();
  const bookHit = ctx.isStd && book && ctx.plyIndex < 30 ? book.get(epd(ctx.fenAfter)) : undefined;
  if (bookHit) {
    m.cls = 'book';
    return bookHit;
  }
  const isBest = before.best === m.uci;
  const l2 = before.second;
  let cls: string;
  if (isBest || (m.loss < 0.01 && before.best == null)) cls = 'best';
  else if (m.loss < 2) cls = 'excellent';
  else if (m.loss < 5) cls = 'good';
  else if (m.loss < 10) cls = 'inaccuracy';
  else if (m.loss < 20) cls = 'mistake';
  else cls = 'blunder';
  if (cls === 'best' || cls === 'excellent') {
    const prevM = ctx.prev;
    const recapture = !!(prevM && prevM.captured && prevM.to === m.to);
    if (m.loss < 2 && wb < 97 && wa >= 50 && !recapture && hangingSacrifice(fenBefore, m)) cls = 'brilliant';
    else if (isBest && l2 && !recapture && ctx.legal > 1) {
      const gap = wb - winFor(m.color, l2);
      if (gap >= 20 && wa >= 40 && wb < 97) cls = 'great';
    }
  }
  if ((cls === 'mistake' || cls === 'blunder' || cls === 'inaccuracy') && ctx.prev && ctx.prev.cls) {
    const p = ctx.prev;
    if (['mistake', 'blunder', 'miss'].includes(p.cls || '') && wb >= 60 && wa >= 30 && m.loss >= 10) cls = 'miss';
  }
  m.cls = cls;
  return null;
}

export function ecoUrlName(u?: string | null) {
  if (!u) return null;
  const s = decodeURIComponent(u.split('/openings/')[1] || '');
  if (!s) return null;
  return s.replace(/-/g, ' ').replace(/\s+\d+\.{1,3}.*$/, '').replace(/\s+/g, ' ').trim();
}

export function classify(g: Game) {
  const ms = g.moves;
  const ev = g.evals;
  g.opening = ecoUrlName(g.headers.ECOUrl);
  ms.forEach((m, i) => {
    const before = ev[i];
    const after = ev[i + 1];
    if (!before || !after) return;
    const bookHit = classifyOne(m, before, after, g.fens[i], {
      prev: i > 0 ? ms[i - 1] : null,
      plyIndex: i,
      isStd: g.isStd,
      fenAfter: g.fens[i + 1],
      legal: g.legal[i],
    });
    if (bookHit) {
      if (bookHit[2]) {
        g.opening = bookHit[1];
        g.eco = bookHit[0];
      }
      m.opening = g.opening;
    }
  });
  g.accuracy = gameAccuracy(ev, ms);
}

export function terminalEval(fen: string): Ev | null {
  const ch = chessAt(fen);
  if (ch.isCheckmate()) return { cp: null, mate: 0, winner: ch.turn() === 'w' ? 'b' : 'w', best: null, pv: [] };
  if (ch.isStalemate() || ch.isInsufficientMaterial()) return { cp: 0, mate: null, best: null, pv: [] };
  return null;
}

export function cloneEval(ev: Ev | null | undefined): Ev | null {
  if (!ev) return null;
  const c: Ev = { ...ev };
  if (ev.pv) c.pv = ev.pv.slice();
  if (ev.second) c.second = { ...ev.second };
  if (ev.lines) {
    c.lines = {};
    for (const k of Object.keys(ev.lines)) {
      const n = Number(k);
      c.lines[n] = { ev: { ...ev.lines[n].ev }, pv: ev.lines[n].pv.slice() };
    }
  }
  return c;
}

export function linesOf(ev: Ev | null | undefined) {
  if (!ev) return null;
  if (ev.lines && Object.keys(ev.lines).length) return ev.lines;
  const lines: Record<number, { ev: { cp: number | null; mate: number | null }; pv: string[] }> = {};
  if (ev.pv && ev.pv.length) lines[1] = { ev: { cp: ev.cp, mate: ev.mate }, pv: ev.pv.slice() };
  else if (ev.best) lines[1] = { ev: { cp: ev.cp, mate: ev.mate }, pv: [ev.best] };
  if (ev.second) lines[2] = { ev: { ...ev.second }, pv: [] };
  return Object.keys(lines).length ? lines : null;
}

export function fmtClock(s: number | null | undefined) {
  if (s == null) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = sec < 10 && h === 0 && m === 0 ? sec.toFixed(1) : String(Math.floor(sec)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
