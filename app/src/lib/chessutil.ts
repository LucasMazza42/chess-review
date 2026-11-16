import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function chessAt(fen?: string) {
  return fen ? new Chess(fen) : new Chess();
}

export function tryMove(
  ch: Chess,
  move: string | { from: string; to: string; promotion?: string },
): Move | null {
  try {
    if (typeof move === 'string') return ch.move(move);
    const spec: { from: string; to: string; promotion?: PieceSymbol } = { from: move.from, to: move.to };
    if (move.promotion) spec.promotion = move.promotion as PieceSymbol;
    return ch.move(spec);
  } catch {
    return null;
  }
}

export function legalMoves(ch: Chess, square?: string): Move[] {
  try {
    if (square) return ch.moves({ square: square as Square, verbose: true });
    return ch.moves({ verbose: true });
  } catch {
    return [];
  }
}

export function loadPgn(pgn: string): Chess | null {
  const ch = new Chess();
  try {
    ch.loadPgn(pgn);
    return ch;
  } catch {
    return null;
  }
}

export function uciOf(m: { from: string; to: string; promotion?: string | null }) {
  return m.from + m.to + (m.promotion || '');
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
