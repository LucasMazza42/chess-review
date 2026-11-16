import { useSession } from '../useSession';
import { fmtDate, levelName, prettyTheme, pzRec, solutionSan } from '../lib/puzzles';
import { chessAt } from '../lib/chessutil';
import type { Level } from '../lib/types';

export function PuzzlePane() {
  const s = useSession();
  if (s.mode !== 'puzzles') return null;
  const P = s.P;
  return (
    <div className="side" id="sidePuzzle">
      <div className="tabs"><button type="button" className="on">Daily Puzzles</button></div>
      <div className="pane" id="puzzleBody" data-ids={s.todayList().map((p) => p.id).join(',')} data-date={P.date} data-view={P.view}>
        {P.err && <div className="err">{P.err}</div>}
        {!P.err && (!P.db || !P.set) && <div className="muted">Loading puzzles…</div>}
        {P.db && P.set && P.view === 'list' && <List />}
        {P.db && P.set && P.view === 'play' && P.puzzle && <Play />}
        {P.db && P.set && P.view === 'done' && <Done />}
      </div>
    </div>
  );
}

function Head() {
  const s = useSession();
  const solved = s.todayList().filter((p) => (pzRec(s.P.date, p.id) || {}).status === 'solved').length;
  return (
    <div className="pzhead">
      <div className="pzdate">{fmtDate(s.P.date)} <span className="muted small">UTC</span></div>
      <div className="muted small">Same puzzles until 00:00 UTC, then a new set.</div>
      <div className="pzstats"><span className="pzchip">{solved}/6 solved</span><span className="pzchip">Streak {s.streak()}</span></div>
      <label className="pzauto"><input id="pzAuto" type="checkbox" checked={localStorage.getItem('cr-pz-auto') === '1'} onChange={(e) => s.setAuto(e.target.checked)} /> Auto-advance</label>
    </div>
  );
}

function List() {
  const s = useSession();
  const level = s.P.level;
  return (
    <>
      <Head />
      <div className="levels">
        {(['easy', 'medium', 'hard'] as Level[]).map((id) => (
          <button type="button" key={id} className={level === id ? 'on' : ''} data-level={id} onClick={() => s.setLevel(id)}>{levelName(id)}</button>
        ))}
      </div>
      <div className="games">
        {(s.P.set?.[level] || []).map((p, i) => {
          const rec = pzRec(s.P.date, p.id) || { status: null, hint: 0 };
          const st = rec.status === 'solved' ? 'Solved' : rec.status === 'failed' ? 'Revealed' : rec.hint ? 'Hint used' : 'New';
          const cls = rec.status === 'solved' ? 'solved' : rec.status === 'failed' ? 'failed' : '';
          return (
            <button type="button" className="pzcard" data-pid={p.id} key={p.id} onClick={() => s.openPuzzle(p)}>
              <span><b>{levelName(level)} {i + 1}</b>{rec.status === 'solved' && <div className="muted small">{p.rating} · {(p.themes || []).map(prettyTheme).join(', ') || 'Tactics'}</div>}</span>
              <span className={'st ' + cls}>{st}</span>
            </button>
          );
        })}
      </div>
      <div className="muted small">From the Lichess puzzle database (CC0). Easy is under 1300, Medium 1300–1800, Hard over 1800. Two of each, every day.</div>
    </>
  );
}

function Play() {
  const s = useSession();
  const P = s.P;
  const p = P.puzzle!;
  const rec = pzRec(P.date, p.id) || { status: null, hint: 0 };
  const you = chessAt(p.fen).turn() === 'w' ? 'White' : 'Black';
  let msg = P.note || `Your turn — you play ${you}.`;
  let cls = '';
  if (P.phase === 'show') msg = 'Playing the solution…';
  else if (P.phase === 'reply') { msg = 'Correct.'; cls = 'good'; }
  else if (P.feedback === 'wrong') { msg = 'Not quite. Try a different move.'; cls = 'bad'; }
  else if (P.phase === 'solved') { msg = 'Solved.'; cls = 'good'; }
  else if (P.phase === 'failed') { msg = 'Solution revealed.'; cls = 'bad'; }
  else if (rec.status === 'solved' && !P.note) msg = 'Solved already. Play it again, or show the solution.';
  const showMeta = P.phase === 'solved' || P.phase === 'failed' || rec.status === 'solved' || rec.status === 'failed';
  const themes = (p.themes || []).map(prettyTheme);
  const done = P.phase === 'solved' || P.phase === 'failed';
  const tip = P.phase === 'user' && P.hint && p
    ? P.hint === 1
      ? `Hint: move the highlighted piece.${p.themes?.[0] ? ' Theme: ' + prettyTheme(p.themes[0]) + '.' : ''}`
      : 'Hint: the green arrow shows the destination square.'
    : '';
  return (
    <>
      <Head />
      <button type="button" className="btn" id="pzBack" onClick={() => s.puzzleBack()}>← All puzzles</button>
      <div className={'pzstat ' + cls}>
        {msg}
        {showMeta && <div className="pzmeta">{p.rating} · {themes.length ? themes.join(' · ') : 'Tactics'}</div>}
        {done && <div className="line">Solution: <span className="mv">{solutionSan(p)}</span></div>}
        {tip && <div className="line">{tip}</div>}
      </div>
      {done && <button type="button" className="btn primary pznext" id="pzNext" onClick={() => s.nextPuzzle()}>{s.nextLabel()}</button>}
      {done && <div className="pzkeys">Enter, N, or →</div>}
      <div className="pzactions">
        <button type="button" className="btn" id="pzHint" disabled={P.phase !== 'user' || P.busy || P.hint >= 2} onClick={() => s.onHint()}>{P.hint === 1 ? 'Show square' : 'Hint'}</button>
        <button type="button" className="btn" id="pzSol" disabled={P.phase === 'show' || P.busy} onClick={() => void s.showSolution()}>Solution</button>
        <button type="button" className="btn" id="pzRetry" onClick={() => s.retryPuzzle()}>Retry</button>
      </div>
      <div className="muted small">{levelName(p.level)} · Lichess {p.id}</div>
    </>
  );
}

function Done() {
  const s = useSession();
  const list = s.todayList();
  const solved = list.filter((p) => (pzRec(s.P.date, p.id) || {}).status === 'solved').length;
  const all = s.allSolvedToday();
  return (
    <>
      <Head />
      <div className="pzdone">
        <h2>{all ? 'All done for today' : solved + '/6 solved'}</h2>
        <div className="pzstats"><span className="pzchip">{solved}/6 solved</span><span className="pzchip">Streak {s.streak()}</span></div>
        <div className="muted">{all ? 'A new set arrives at 00:00 UTC.' : 'Solve the rest to keep the streak going.'}</div>
        <button type="button" className="btn" id="pzBack" onClick={() => s.puzzleBack()}>← All puzzles</button>
      </div>
    </>
  );
}
