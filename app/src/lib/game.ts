import type { ChessComGame, Game, RMove } from './types';
import { START_FEN, chessAt, hash, legalMoves, loadPgn, tryMove, uciOf } from './chessutil';
import { ecoUrlName } from './eval';

export function parseClocks(pgn: string) {
  const c = [...pgn.matchAll(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map((x) => +x[1] * 3600 + +x[2] * 60 + +x[3]);
  return c.length ? c : null;
}

export function buildGame(pgn: string, meta: ChessComGame | null): Game {
  const clean = pgn.replace(/\r/g, '');
  const ch = loadPgn(clean);
  if (!ch) throw new Error('Could not parse that PGN.');
  const headers = ch.getHeaders();
  const hist = ch.history({ verbose: true });
  const start = headers.FEN || START_FEN;
  const re = chessAt(start);
  const fens = [re.fen()];
  const legal = [legalMoves(re).length];
  const moves: RMove[] = [];
  for (const h of hist) {
    const beforeCount = legalMoves(re).length;
    const m = tryMove(re, { from: h.from, to: h.to, promotion: h.promotion });
    if (!m) throw new Error('Could not parse that PGN.');
    fens.push(re.fen());
    legal.push(legalMoves(re).length);
    moves.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion || null,
      captured: m.captured || null,
      color: m.color,
      uci: uciOf(m),
      legal: beforeCount,
    });
  }
  if (!moves.length) throw new Error('That game has no moves.');
  let clocks = parseClocks(clean);
  if (clocks && clocks.length !== moves.length) clocks = null;
  const tc = (headers.TimeControl || '').split('+')[0];
  const id = meta && meta.url ? meta.url : 'pgn:' + hash(fens.join('|'));
  const acc = meta && meta.accuracies ? { white: meta.accuracies.white ?? null, black: meta.accuracies.black ?? null } : null;
  return {
    headers,
    fens,
    legal,
    moves,
    clocks,
    startClock: /^\d+$/.test(tc) ? +tc : null,
    id,
    meta,
    startMoveNo: +start.split(' ')[5] || 1,
    isStd: !headers.FEN && !(headers.Variant && !/standard/i.test(headers.Variant)),
    opening: ecoUrlName(headers.ECOUrl),
    chessComAcc: acc,
    evals: [],
    done: false,
  };
}

export function tcLabel(tc?: string) {
  if (!tc || tc === '-') return '';
  if (tc.includes('/')) {
    const d = +tc.split('/')[1];
    return Math.round(d / 86400) + ' day' + (d >= 172800 ? 's' : '');
  }
  const [b, inc] = tc.split('+').map(Number);
  const m = b >= 60 ? b / 60 + ' min' : b + 's';
  return inc ? `${b >= 60 ? b / 60 : b + 's'} | ${inc}` : m;
}

export const TC_ICON: Record<string, string> = { bullet: '⁍', blitz: '⚡', rapid: '⏱', daily: '☀', classical: '♜' };
export const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];

export async function api(url: string) {
  const r = await fetch(url);
  if (r.status === 404) throw new Error('User not found on Chess.com.');
  if (!r.ok) throw new Error('Chess.com API error ' + r.status);
  return r.json();
}
