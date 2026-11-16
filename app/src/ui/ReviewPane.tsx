import { useEffect, useRef, useState } from 'react';
import { useSession } from '../useSession';
import { CLS, CLS_ORDER, evShort, evTextSigned, pvSan, uciToSan, winFor, winWhite } from '../lib/eval';
import { DRAWS, TC_ICON, tcLabel } from '../lib/game';
import type { Color, Ev, RMove } from '../lib/types';

export function ReviewPane() {
  const s = useSession();
  if (s.mode !== 'review') return null;
  const [y, mo] = (s.archives[s.monthIdx] || '').split('/').slice(-2);
  const monthLabel = y ? new Date(+y, +mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' }) : '—';
  return (
    <div className="side" id="sideReview">
      <div className="tabs">
        <button type="button" className={s.tab === 'games' ? 'on' : ''} onClick={() => s.setTab('games')}>Games</button>
        <button type="button" className={s.tab === 'review' ? 'on' : ''} onClick={() => s.setTab('review')}>Review</button>
      </div>
      {s.tab === 'games' ? (
        <div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); void s.loadUser(String(fd.get('user') || '')); }}>
            <input id="username" name="user" defaultValue={s.user} key={s.user} placeholder="Chess.com username" />
            <button className="btn primary" id="loadUser" type="submit">Load games</button>
          </form>
          <div className="monthnav">
            <button className="btn" type="button" id="prevMonth" disabled={s.monthIdx <= 0} onClick={() => s.prevMonth()}>‹</button>
            <b id="monthLabel">{monthLabel}</b>
            <button className="btn" type="button" id="nextMonth" disabled={s.monthIdx >= s.archives.length - 1} onClick={() => s.nextMonth()}>›</button>
          </div>
          <div id="gamesStatus" className={s.gamesErr ? 'err small' : 'muted small'}>{s.gamesStatus}</div>
          <div className="games" id="gamesList">
            {s.monthGames.map((g, i) => {
              const me = s.user.toLowerCase();
              const col: Color = g.white.username.toLowerCase() === me ? 'w' : 'b';
              const mine = col === 'w' ? g.white : g.black;
              const opp = col === 'w' ? g.black : g.white;
              const res = mine.result === 'win' ? 'win' : DRAWS.includes(mine.result) ? 'draw' : 'loss';
              const date = new Date(g.end_time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <button type="button" className="g" data-i={i} key={g.url || i} onClick={() => s.openChessCom(g)}>
                  <span className={'dot ' + col} />
                  <span>
                    <span className="opp">{opp.username}</span> <span className="muted">({opp.rating})</span>
                    <span className="meta" style={{ display: 'block' }}>You {mine.rating} · {mine.result} · {date}{g.rules !== 'chess' ? ` · ${g.rules}` : ''}</span>
                  </span>
                  <span className="small">{TC_ICON[g.time_class || ''] || ''} {tcLabel(g.time_control)}</span>
                  <span className={'res ' + res}>{res === 'win' ? 'W' : res === 'loss' ? 'L' : '½'}</span>
                </button>
              );
            })}
            {!s.monthGames.length && s.gamesStatus.startsWith('No games') && <div className="empty">No games this month.</div>}
          </div>
          <PgnBox />
        </div>
      ) : (
        <ReviewBody />
      )}
    </div>
  );
}

function PgnBox() {
  const s = useSession();
  const [text, setText] = useState('');
  return (
    <details>
      <summary>Paste a PGN instead</summary>
      <textarea id="pgnInput" value={text} placeholder={'[Event "..."]\n1. e4 e5 2. Nf3 ...'} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn primary" id="loadPgn" type="button" onClick={() => s.openPgn(text)}>Review PGN</button>
        <span className="err small">{s.pgnErr}</span>
      </div>
    </details>
  );
}

function useCompact() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 979px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 979px)');
    const fn = () => setCompact(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return compact;
}

function Fold({ title, startOpen, children }: { title: string; startOpen: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (ref.current) ref.current.open = startOpen; }, [startOpen]);
  return <details ref={ref} className="fold"><summary>{title}</summary>{children}</details>;
}

function ReviewBody() {
  const s = useSession();
  const compact = useCompact();
  const g = s.game;
  if (!g) return <div className="empty" id="noGame">Pick a game from the Games tab or paste a PGN to start a review.</div>;
  const h = g.headers;
  const meta = [h.Result, h.TimeControl ? tcLabel(h.TimeControl) : '', h.Date && h.Date !== '????.??.??' ? h.Date.replace(/\./g, '-') : ''].filter(Boolean).join(' · ');
  return (
    <div id="reviewBody">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="opening" id="openingName">{g.opening || 'Unknown opening'}</div>
        <span className="chip">{meta}</span>
      </div>
      {s.progress.show && (
        <div style={{ marginTop: 8 }}>
          <div className="row small" style={{ justifyContent: 'space-between' }}>
            <span className={s.progress.err ? 'err' : 'muted'}>{s.progress.text}</span>
            <span>{s.progress.n ? Math.round(s.progress.i / s.progress.n * 100) + '%' : ''}</span>
          </div>
          <div className="progress"><div style={{ width: (s.progress.n ? s.progress.i / s.progress.n * 100 : 0) + '%' }} /></div>
        </div>
      )}
      <Fold title="Coach" startOpen>
        <Coach />
      </Fold>
      <Graph />
      <ExploreBar />
      <Fold title="Moves and accuracy" startOpen={!compact}>
        <div className="scroller" id="scroller">
          <Summary />
          <Moves />
        </div>
      </Fold>
    </div>
  );
}

function Coach() {
  const s = useSession();
  const g = s.game;
  if (!g) return null;
  const x = s.explore;
  if (x && x.idx > 0) return <ExploreCoach />;
  const ply = x ? x.anchor : s.ply;
  const ev = g.evals && g.evals[ply];
  const evHtml = ev ? <span className={'ev' + (winWhite(ev) < 50 ? ' neg' : '')}>{evTextSigned(ev)}</span> : null;
  if (ply === 0) {
    return (
      <div className="coach" id="coach">
        <div className="ic" style={{ background: '#3c3a37' }}>♟</div>
        <div>
          <div className="t">{g.evals?.length ? 'Review ready. Use the arrows to step through the game.' : 'Starting position.'}</div>
          {g.opening && <div className="line">Opening: <span className="mv">{g.opening}</span></div>}
          {ev && ev.best && <div className="line">Engine: <span className="mv">{pvSan(g.fens[0], ev.pv)}</span></div>}
        </div>
        {evHtml}
      </div>
    );
  }
  const m = g.moves[ply - 1];
  const prev = g.evals && g.evals[ply - 1];
  if (!m.cls || !prev || !ev) {
    return <div className="coach" id="coach"><div className="ic" style={{ background: '#3c3a37' }}>…</div><div className="t"><b>{m.san}</b><div className="line">Analysis pending…</div></div>{evHtml}</div>;
  }
  const c = CLS[m.cls as keyof typeof CLS];
  const who = m.color === 'w' ? g.headers.White : g.headers.Black;
  const bestSan = prev.best ? uciToSan(g.fens[ply - 1], prev.best) : '';
  const NOUN: Record<string, string> = { excellent: 'excellent', good: 'good', inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder' };
  let msg = `${m.san} is ${NOUN[m.cls] || c.name.toLowerCase()}`;
  if (m.cls === 'book') msg = `${m.san} is a book move`;
  if (m.cls === 'best') msg = `${m.san} is the best move`;
  if (m.cls === 'brilliant') msg = `${m.san} is brilliant!`;
  if (m.cls === 'great') msg = `${m.san} is a great move — the only good move here`;
  if (m.cls === 'miss') msg = `${m.san} is a miss — the opponent's error went unpunished`;
  return (
    <div className="coach" id="coach">
      <div className="ic" style={{ background: c.color }}>{c.sym}</div>
      <div>
        <div className="t"><b>{m.san}</b> {msg.replace(m.san, '').trim()}</div>
        {bestSan && prev.best !== m.uci && m.cls !== 'book' && <div className="line"><span className="mv" style={{ color: 'var(--best)', fontWeight: 700 }}>{bestSan}</span> was best. Best line: <span className="mv">{pvSan(g.fens[ply - 1], prev.pv)}</span></div>}
        {m.cls === 'book' && m.opening && <div className="line">{m.opening}</div>}
        {ev.pv && ev.pv.length > 0 && <div className="line">Engine continuation: <span className="mv">{pvSan(g.fens[ply], ev.pv)}</span></div>}
        <div className="line">{who} · win chance {winFor(m.color, prev).toFixed(0)}% → {winFor(m.color, ev).toFixed(0)}%{(m.loss || 0) > 0.05 ? ` (−${(m.loss || 0).toFixed(1)})` : ''}</div>
      </div>
      {evHtml}
    </div>
  );
}

function ExploreCoach() {
  const s = useSession();
  const x = s.explore!;
  const m = x.moves[x.idx - 1];
  const ev = x.evals[x.idx];
  const c = m.cls && m.cls in CLS ? CLS[m.cls as keyof typeof CLS] : null;
  const engineMove = x.vsEngine && x.userColor && m.color !== x.userColor;
  const before = x.evals[x.idx - 1];
  return (
    <div className="coach" id="coach">
      <div className="ic" style={{ background: c ? c.color : '#3c3a37' }}>{c ? c.sym : '…'}</div>
      <div>
        <div className="t">
          {!m.cls && <><b>{m.san}</b> — scoring this move…</>}
          {m.cls && x.idx === 1 && <Compare />}
          {m.cls && x.idx !== 1 && <>{engineMove ? 'Engine plays' : 'Your try'} <b>{m.san}</b>: <b style={{ color: c?.color }}>{c?.name}</b> ({evShort(ev)})</>}
        </div>
        {m.cls && before && ev && <div className="line">{engineMove ? 'Engine' : 'You'} · win chance {winFor(m.color, before).toFixed(0)}% → {winFor(m.color, ev).toFixed(0)}%</div>}
        {ev && ev.pv && ev.pv.length > 0 && <div className="line">Engine: <span className="mv">{pvSan(x.fens[x.idx], ev.pv)}</span></div>}
      </div>
      {ev && <span className={'ev' + (winWhite(ev) < 50 ? ' neg' : '')}>{evTextSigned(ev)}</span>}
    </div>
  );
}

function Compare() {
  const s = useSession();
  const x = s.explore;
  const g = s.game;
  if (!x || !x.moves.length || !g) return null;
  const t = x.moves[0];
  const tEv = t.evalAfter || x.evals[1];
  const paint = (m: RMove | undefined, _ev: Ev | null | undefined) => m && m.cls && m.cls in CLS
    ? <b style={{ color: CLS[m.cls as keyof typeof CLS].color }}>{CLS[m.cls as keyof typeof CLS].name}</b>
    : '…';
  const gm = g.moves[x.anchor];
  return (
    <span>
      Your try <b>{t.san}</b>: {paint(t, tEv)} ({evShort(tEv)})
      {gm && <> vs game move <b>{gm.san}</b>: {paint(gm, g.evals[x.anchor + 1])} ({evShort(g.evals[x.anchor + 1])})</>}
    </span>
  );
}

function Graph() {
  const s = useSession();
  const g = s.game;
  if (!g || !g.evals?.length) return <svg className="graph" id="graph" />;
  const N = g.fens.length - 1 || 1;
  const W = 400, H = 90;
  const X = (i: number) => i / N * W;
  const Y = (ev: Ev) => H - winWhite(ev) / 100 * H;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) if (g.evals[i]) pts.push([X(i), Y(g.evals[i]!)]);
  const dots = ['blunder', 'mistake', 'miss', 'brilliant', 'great', 'inaccuracy'];
  return (
    <svg className="graph" id="graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={(e) => s.graphClick(e)}>
      <rect x="0" y="0" width={W} height={H} fill="#403d39" />
      {pts.length > 0 && <path d={`M0,${H} ${pts.map((p) => `L${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(2)},${H} Z`} fill="#fff" />}
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeWidth=".5" strokeDasharray="3 3" />
      <line x1={X(s.ply)} x2={X(s.ply)} y1="0" y2={H} stroke="#81b64c" strokeWidth="2" />
      {g.moves.map((m, i) => m.cls && dots.includes(m.cls) && g.evals[i + 1] ? (
        <g className="gdot" data-ply={i + 1} key={i}>
          <title>{CLS[m.cls as keyof typeof CLS].name} · {m.san}</title>
          <circle cx={X(i + 1)} cy={Y(g.evals[i + 1]!)} r={m.cls === 'blunder' || m.cls === 'mistake' ? 4.2 : 3} fill={CLS[m.cls as keyof typeof CLS].color} stroke="#000" strokeWidth=".4" />
        </g>
      ) : null)}
    </svg>
  );
}

function ExploreBar() {
  const s = useSession();
  const g = s.game;
  if (!g) return null;
  const x = s.explore;
  const has = !!(x && x.moves.length);
  const lines = x ? (x.lines || null) : null;
  return (
    <div className="explorebar" id="exploreBar">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="chip">{!g.done ? 'Try moves once the review finishes' : has ? 'Exploring — use ◀ ▶ to step the line' : 'Drag or tap pieces to try a move'}</span>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
          <input id="optVsEngine" type="checkbox" checked={x ? x.vsEngine : s.optVs} onChange={(e) => void s.setVsEngine(e.target.checked)} /> Play vs engine
        </label>
      </div>
      {has && <div className="cmp"><Compare /></div>}
      <div className="enginelines" id="engineLines">
        {x && x.busy && !lines && <div className="muted small">Engine thinking…</div>}
        {x && lines && Object.keys(lines).map(Number).sort((a, b) => a - b).slice(0, 3).map((k) => (
          <div className="ln" key={k}><span className="evn">{evShort(lines[k].ev)}</span><span className="mv">{pvSan(x.fens[x.idx], lines[k].pv, 10) || '…'}</span></div>
        ))}
      </div>
      <div className="row">
        <button className="btn" type="button" id="bUndo" disabled={!has} onClick={() => s.undoExplore()}>Undo</button>
        <button className="btn" type="button" id="bBackGame" disabled={!x} onClick={() => s.backToGame()}>Back to game</button>
      </div>
    </div>
  );
}

function Summary() {
  const s = useSession();
  const g = s.game;
  if (!g || !g.done || !g.accuracy) return null;
  const a = g.accuracy;
  const cell = (color: Color, cls: keyof typeof CLS) => {
    const plies = s.classPlies(color, cls);
    const n = plies.length;
    const at = plies.indexOf(s.ply);
    const who = color === 'w' ? (g.headers.White || 'White') : (g.headers.Black || 'Black');
    const title = n ? (at >= 0 ? `${who}'s ${CLS[cls].name} ${at + 1} of ${n}. Click for the next.` : `Jump to ${who}'s first ${CLS[cls].name}`) : `No ${CLS[cls].name} moves`;
    return (
      <td className="c" key={color + cls}>
        <button type="button" className="clsjump" style={{ color: CLS[cls].color }} data-color={color} data-cls={cls} data-n={n} data-at={at} title={title} disabled={!n} onClick={() => s.jumpClass(color, cls)}>
          <span className="cnt">{n}</span>
          {at >= 0 && <span className="k">{at + 1}/{n}</span>}
        </button>
      </td>
    );
  };
  return (
    <table className="sumtbl" id="summary">
      <tbody>
        <tr><td /><td className="c">{g.headers.White || 'White'}</td><td className="c">{g.headers.Black || 'Black'}</td></tr>
        <tr className="acc"><td><b>Accuracy</b></td><td className="c"><span className="accbox" id="accW">{a.w != null ? a.w.toFixed(1) : '–'}</span></td><td className="c"><span className="accbox b" id="accB">{a.b != null ? a.b.toFixed(1) : '–'}</span></td></tr>
        {g.chessComAcc && <tr><td className="muted small">Chess.com's own (if game was reviewed)</td><td className="c small muted">{g.chessComAcc.white != null ? g.chessComAcc.white.toFixed(1) : '–'}</td><td className="c small muted">{g.chessComAcc.black != null ? g.chessComAcc.black.toFixed(1) : '–'}</td></tr>}
        {CLS_ORDER.map((c) => (
          <tr key={c}><td><span className="lab"><span className="ico" style={{ background: CLS[c].color }}>{CLS[c].sym}</span>{CLS[c].name}</span></td>{cell('w', c)}{cell('b', c)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Moves() {
  const s = useSession();
  const g = s.game;
  if (!g) return null;
  const anchor = s.explore && s.explore.moves.length ? s.explore.anchor : null;
  const mainCur = !s.explore || s.explore.idx === 0;
  const startBlack = g.moves.length > 0 && g.moves[0].color === 'b';
  const rows: React.ReactNode[] = [];
  let i = 0;
  let num = g.startMoveNo;
  const cell = (k: number) => {
    const m = g.moves[k];
    const c = m.cls && m.cls in CLS ? CLS[m.cls as keyof typeof CLS] : null;
    return <button type="button" className={'m' + (mainCur && s.ply === k + 1 ? ' cur' : '')} data-ply={k + 1} key={'m' + k} onClick={() => s.clickMove(k + 1)}>{c && <span className="ico" style={{ background: c.color }}>{c.sym}</span>}<span>{m.san}</span></button>;
  };
  if (startBlack && anchor === 0) rows.push(<Var key="v0" />);
  if (startBlack) {
    rows.push(<div className="mrow" key={'r' + i}><div className="n">{num}.</div><div className="m">…</div>{cell(0)}</div>);
    i = 1; num++;
  }
  while (i < g.moves.length) {
    if (anchor === i) rows.push(<Var key={'v' + i} />);
    if (i + 1 < g.moves.length && anchor === i + 1) {
      rows.push(<div className="mrow" key={'r' + i}><div className="n">{num}.</div>{cell(i)}<div /></div>);
      rows.push(<Var key={'v' + (i + 1)} />);
      rows.push(<div className="mrow" key={'r' + (i + 1)}><div className="n">{num}.</div><div className="m">…</div>{cell(i + 1)}</div>);
    } else {
      rows.push(<div className="mrow" key={'r' + i}><div className="n">{num}.</div>{cell(i)}{i + 1 < g.moves.length ? cell(i + 1) : <div />}</div>);
    }
    i += 2; num++;
  }
  if (anchor === g.moves.length) rows.push(<Var key="vend" />);
  return <div className="moves" id="moves">{rows}</div>;
}

function Var() {
  const s = useSession();
  const x = s.explore;
  const g = s.game;
  if (!x || !x.moves.length || !g) return null;
  const instead = g.moves[x.anchor];
  return (
    <div className="var">
      <span className="tag" style={{ color: 'var(--green)', fontWeight: 800, fontSize: 11 }}>Try</span>
      <span className="muted small">{instead ? 'instead of ' + instead.san : 'line'}</span>
      {x.moves.map((m, i) => {
        const n = +x.fens[i].split(' ')[5];
        const lead = m.color === 'w' ? n + '. ' : (i === 0 || x.moves[i - 1].color !== 'w' ? n + '… ' : '');
        const c = m.cls && m.cls in CLS ? CLS[m.cls as keyof typeof CLS] : null;
        return <button type="button" className={'m' + (x.idx === i + 1 ? ' cur' : '')} data-var={i + 1} key={i} onClick={() => s.clickVar(i + 1)}>{c && <span className="ico" style={{ background: c.color }}>{c.sym}</span>}<span>{lead + m.san}</span></button>;
      })}
    </div>
  );
}
