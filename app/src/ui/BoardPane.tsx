import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import type { CSSProperties } from 'react';
import { useSession } from '../useSession';
import { CLS, HL, evText, fmtClock, winWhite } from '../lib/eval';
import { pzRec } from '../lib/puzzles';
import type { Color } from '../lib/types';

const PROMO = [
  { p: 'q', g: '♕' },
  { p: 'r', g: '♖' },
  { p: 'b', g: '♗' },
  { p: 'n', g: '♘' },
];

function promoBox(sq: string, flipped: boolean): CSSProperties {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  const down = row <= 3;
  return down
    ? { left: `${col * 12.5}%`, top: `${row * 12.5}%` }
    : { left: `${col * 12.5}%`, bottom: `${(7 - row) * 12.5}%` };
}

export function BoardPane() {
  const s = useSession();
  const view = s.displayed();
  const flipped = s.boardFlipped();
  const squareStyles: Record<string, CSSProperties> = {};
  const mv = view.move;
  if (mv) {
    const cls = 'cls' in mv ? mv.cls : null;
    const tint = cls && HL[cls] ? HL[cls] : 'rgba(255, 255, 120, .45)';
    squareStyles[mv.from] = { backgroundColor: tint };
    squareStyles[mv.to] = { backgroundColor: tint };
  }
  if (s.sel) {
    squareStyles[s.sel.from] = { backgroundColor: 'rgba(255,255,120,.55)' };
    for (const sq of s.sel.tos) {
      squareStyles[sq] = s.sel.caps.has(sq)
        ? { boxShadow: 'inset 0 0 0 5px rgba(0,0,0,.45)' }
        : { backgroundImage: 'radial-gradient(circle, rgba(0,0,0,.35) 16%, transparent 17%)' };
    }
  }
  if (s.mode === 'puzzles' && s.P.bad) {
    squareStyles[s.P.bad.from] = { backgroundColor: 'rgba(250,65,45,.5)' };
    squareStyles[s.P.bad.to] = { backgroundColor: 'rgba(250,65,45,.5)' };
  }
  if (s.mode === 'puzzles' && s.P.hint >= 1 && s.P.phase === 'user' && s.P.puzzle) {
    const from = s.P.puzzle.solution[s.P.step]?.slice(0, 2);
    if (from) squareStyles[from] = { backgroundColor: 'rgba(129,182,76,.55)' };
  }
  const options: ChessboardOptions = {
    id: 'review-board',
    position: view.fen,
    boardOrientation: flipped ? 'black' : 'white',
    allowDragging: true,
    allowDragOffBoard: false,
    allowDrawingArrows: false,
    dragActivationDistance: 8,
    animationDurationInMs: 160,
    showAnimations: true,
    darkSquareStyle: { backgroundColor: '#739552' },
    lightSquareStyle: { backgroundColor: '#ebecd0' },
    boardStyle: { width: '100%', borderRadius: 4, overflow: 'hidden' },
    arrows: s.arrows(),
    canDragPiece: ({ piece }) => s.canDrag(piece.pieceType[0] as Color),
    onPieceDrop: ({ sourceSquare, targetSquare }) => s.drop(sourceSquare, targetSquare),
    onSquareClick: ({ square }) => s.clickSquare(square),
    squareRenderer: ({ square, children }) => {
      const badge = mv && 'cls' in mv && mv.cls && mv.to === square ? mv.cls : '';
      const info = badge && badge in CLS ? CLS[badge as keyof typeof CLS] : null;
      return (
        <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
          {children}
          {info && <span className="badge" style={{ background: info.color }}>{info.sym}</span>}
        </div>
      );
    },
  };
  const top: Color = flipped ? 'w' : 'b';
  const bot: Color = top === 'w' ? 'b' : 'w';
  const ev = view.ev;
  let w = ev ? winWhite(ev) : 50;
  if (ev && ev.mate == null) w = Math.max(4, Math.min(96, w));
  const whiteBetter = ev ? (ev.mate != null ? ev.mate > 0 || (ev.mate === 0 && ev.winner === 'w') : (ev.cp ?? 0) >= 0) : true;
  const t = evText(ev);
  const onTop = whiteBetter === flipped;
  return (
    <div className="boardcol">
      <div className="boardstack">
        <Player color={top} />
        <div className="boardrow">
          <div className={'evalbar' + (flipped ? ' flipped' : '') + (s.mode === 'puzzles' ? ' hidden' : '')} id="evalbar">
            <div className="fill-b" style={{ flexGrow: 100 - w }} />
            <div className="fill-w" style={{ flexGrow: w }} />
            <div className="lbl top" style={{ color: flipped ? '#403d39' : '#fff' }}>{onTop ? t : ''}</div>
            <div className="lbl bot" style={{ color: flipped ? '#fff' : '#403d39' }}>{onTop ? '' : t}</div>
          </div>
          <div className="boardwrap" id="board">
            <Chessboard options={options} />
            {s.promo && (
              <div className="promo" style={promoBox(s.promo.to, flipped)}>
                {PROMO.map((x) => (
                  <button key={x.p} type="button" data-promo={x.p} style={{ color: s.promo!.color === 'w' ? '#fff' : '#ddd' }} onClick={() => s.finishPromo(x.p)}>{x.g}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <NextUnderBoard />
        <Player color={bot} />
      </div>
      {s.mode === 'review' && (
        <div className="navbtns" aria-label="Move navigation">
          <button className="btn" type="button" onClick={() => s.stepEnds(false)} title="Start">⏮</button>
          <button className="btn" type="button" id="bPrev" onClick={() => s.prev()} title="Previous">◀</button>
          <button className="btn" type="button" id="bNext" onClick={() => s.next()} title="Next">▶</button>
          <button className="btn" type="button" onClick={() => s.stepEnds(true)} title="End">⏭</button>
          <button className="btn" type="button" onClick={() => s.flip()} title="Flip">⇅</button>
        </div>
      )}
      {s.mode === 'puzzles' && (
        <button className="btn flipwide" type="button" onClick={() => s.flip()} title="Flip">⇅ Flip</button>
      )}
    </div>
  );
}

function NextUnderBoard() {
  const s = useSession();
  if (s.mode !== 'puzzles') return null;
  if (s.puzzleDone()) {
    return <button type="button" className="btn primary pznext" id="pzNextBoard" onClick={() => s.nextPuzzle()}>{s.nextLabel()}</button>;
  }
  if (s.P.view !== 'done') return null;
  const solved = s.todayList().filter((p) => (pzRec(s.P.date, p.id) || {}).status === 'solved').length;
  const title = s.allSolvedToday() ? 'All done for today' : `${solved}/6 solved`;
  return (
    <button type="button" className="btn primary pznext" id="pzNextBoard" onClick={() => document.getElementById('puzzleBody')?.scrollIntoView({ block: 'start' })}>
      {title} · Streak {s.streak()}
    </button>
  );
}

function Player({ color }: { color: Color }) {
  const s = useSession();
  let name = color === 'w' ? 'White' : 'Black';
  let rating = '';
  let clock = '';
  if (s.mode === 'puzzles') {
    const solver = s.P.puzzle ? (s.P.startFen.split(' ')[1] as Color) : 'w';
    name = s.P.puzzle ? (color === solver ? 'You' : 'Opponent') : name;
  } else if (s.game) {
    const h = s.game.headers;
    name = color === 'w' ? h.White || 'White' : h.Black || 'Black';
    const elo = color === 'w' ? h.WhiteElo : h.BlackElo;
    if (elo) rating = `(${elo})`;
    clock = fmtClock(clockOf(s, color));
  }
  return (
    <div className="pbar">
      <div className={'av ' + color}>{color === 'w' ? '♔' : '♚'}</div>
      <span className="nm">{name}</span>
      <span className="rt">{rating}</span>
      {clock && <span className="clk">{clock}</span>}
    </div>
  );
}

function clockOf(s: ReturnType<typeof useSession>, color: Color) {
  const g = s.game;
  if (!g || !g.clocks) return null;
  for (let i = s.ply - 1; i >= 0; i--) if (g.moves[i].color === color) return g.clocks[i];
  return g.startClock;
}
