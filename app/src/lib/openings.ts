import { chessAt, epd, tryMove } from './chessutil';

const OPENINGS_URL = (l: string) => `https://cdn.jsdelivr.net/gh/lichess-org/chess-openings@master/${l}.tsv`;
const BOOK_KEY = 'cr-book-v3';

export type BookHit = [string, string, number];
let BOOK: Map<string, BookHit> | null = null;

export function getBook() {
  return BOOK;
}

export async function loadBook() {
  if (BOOK) return BOOK;
  try {
    const c = localStorage.getItem(BOOK_KEY);
    if (c) {
      BOOK = new Map(JSON.parse(c) as [string, BookHit][]);
      return BOOK;
    }
  } catch { /* ignore */ }
  const map = new Map<string, BookHit>();
  try {
    const txts = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((l) => fetch(OPENINGS_URL(l)).then((r) => (r.ok ? r.text() : ''))));
    const ch = chessAt();
    for (const txt of txts) {
      for (const row of txt.split('\n').slice(1)) {
        const [eco, name, pgn] = row.split('\t');
        if (!pgn) continue;
        ch.reset();
        const toks = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
        const seen: string[] = [];
        for (const s of toks) {
          if (!s || s === '*' || /^\d/.test(s)) continue;
          if (!tryMove(ch, s)) break;
          seen.push(epd(ch.fen()));
        }
        seen.forEach((k, j) => {
          const exact = j === seen.length - 1;
          const prev = map.get(k);
          if (!prev || (exact && !prev[2]) || (exact === !!prev[2] && prev[1].length > name.length)) {
            map.set(k, [eco, name, exact ? 1 : 0]);
          }
        });
      }
    }
    BOOK = map;
    try { localStorage.setItem(BOOK_KEY, JSON.stringify([...map])); } catch { /* quota */ }
  } catch (e) {
    console.warn('opening book unavailable', e);
    BOOK = map;
  }
  return BOOK;
}
