import { useEffect } from 'react';
import { useSession } from './useSession';
import { session } from './session';
import { BoardPane } from './ui/BoardPane';
import { ReviewPane } from './ui/ReviewPane';
import { PuzzlePane } from './ui/PuzzlePane';
import './App.css';

export default function App() {
  const s = useSession();
  useEffect(() => {
    const root = document.body;
    root.dataset.mode = s.mode;
    root.dataset.reviewDone = s.game?.done ? '1' : '';
    root.dataset.fen = s.mode === 'puzzles' ? (s.P.fen || '') : (s.displayed().fen || '');
    root.dataset.puzzlePhase = s.mode === 'puzzles' ? s.P.phase : '';
    root.dataset.puzzleId = s.P.puzzle?.id || '';
    root.dataset.explore = s.explore && s.explore.moves.length ? '1' : '';
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (session.mode === 'puzzles') {
        if (e.key === 'Escape' && session.promo) { session.cancelPromo(); e.preventDefault(); }
        else if (session.puzzleDone() && (e.key === 'Enter' || e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight')) {
          if (e.key === 'Enter' && tag === 'BUTTON') return;
          e.preventDefault();
          session.nextPuzzle();
        } else if (e.key === 'f' || e.key === 'F') session.flip();
        return;
      }
      if (e.key === 'Escape' && session.promo) { session.cancelPromo(); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft') { session.prev(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { session.next(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'Home') { session.stepEnds(false); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'End') { session.stepEnds(true); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') session.flip();
    };
    document.addEventListener('keydown', onKey);
    let x0 = 0, y0 = 0, ignore = false;
    const start = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      x0 = t.clientX; y0 = t.clientY;
      const el = e.target as Element | null;
      ignore = !!(el && el.closest && (el.closest('#review-board-board') || el.closest('button') || el.closest('a') || el.closest('input') || el.closest('textarea')));
    };
    const end = (e: TouchEvent) => {
      if (ignore || session.mode !== 'review') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0) session.next();
        else session.prev();
      }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
    };
  }, []);
  return (
    <div className="app">
      <header>
        <div className="logo"><span className="pawn">♟</span> Game Review</div>
        <nav className="modes" id="modes">
          <button type="button" className={s.mode === 'review' ? 'on' : ''} data-mode="review" onClick={() => s.setMode('review')}>Game Review</button>
          <button type="button" className={s.mode === 'puzzles' ? 'on' : ''} data-mode="puzzles" onClick={() => s.setMode('puzzles')}>Daily Puzzles</button>
        </nav>
        <div className="spacer" />
        <div className="sub" id="headSub">{s.mode === 'puzzles' ? 'Lichess puzzles · a new set every day' : 'Chess.com games · Stockfish 18 in your browser'}</div>
        {s.mode === 'review' && (
          <div className="settings" id="reviewSettings">
            <label>Depth
              <select id="depth" value={s.depth} onChange={(e) => s.setDepth(+e.target.value)}>
                {[12, 14, 16, 18, 20, 22].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label><input id="optArrow" type="checkbox" checked={s.optArrow} onChange={(e) => s.setOpt('arrow', e.target.checked)} /> Best-move arrows</label>
            <label><input id="optEngine" type="checkbox" checked={s.optEngine} onChange={(e) => s.setOpt('engine', e.target.checked)} /> Engine arrow</label>
          </div>
        )}
      </header>
      <div className="stage">
        <BoardPane />
        <ReviewPane />
        <PuzzlePane />
      </div>
      <div className="pad" />
      <nav className="tabbar" aria-label="Sections">
        <button type="button" className={s.mode === 'review' ? 'on' : ''} onClick={() => s.setMode('review')}>Review</button>
        <button type="button" className={s.mode === 'puzzles' ? 'on' : ''} onClick={() => s.setMode('puzzles')}>Puzzles</button>
      </nav>
    </div>
  );
}
