import type { Arrow } from 'react-chessboard';
import type { Move } from 'chess.js';
import { Engine, packResult } from './lib/engine';
import { loadBook } from './lib/openings';
import { api, buildGame } from './lib/game';
import type { ChessComGame } from './lib/types';
import {
  classify,
  classifyOne,
  cloneEval,
  linesOf,
  terminalEval,
} from './lib/eval';
import { START_FEN, chessAt, clamp, legalMoves, tryMove, uciOf } from './lib/chessutil';
import {
  autoAdvanceOn,
  hashStr,
  pickN,
  pzRec,
  pzWrite,
  setAutoAdvance,
  streak,
} from './lib/puzzles';
import type { Color, Ev, ExploreState, Game, Level, Promo, Puzzle, PuzzleDB, PuzzleState, Sel } from './lib/types';

const CACHE_VER = 'cr2';

function blankPuzzle(): PuzzleState {
  return {
    db: null, date: '', level: 'easy', set: null, view: 'list', err: '',
    puzzle: null, startFen: '', startLast: null, fen: '', lastMove: null,
    step: 0, phase: 'user', feedback: '', note: '', hint: 0, hintUsed: 0,
    busy: false, bad: null, flipped: false, token: 0,
  };
}

export class Session {
  mode: 'review' | 'puzzles' = 'review';
  user = 'LucasMazza';
  archives: string[] = [];
  monthIdx = -1;
  monthGames: ChessComGame[] = [];
  gamesStatus = '';
  gamesErr = false;
  game: Game | null = null;
  ply = 0;
  flipped = false;
  gen = 0;
  explore: ExploreState | null = null;
  sel: Sel | null = null;
  promo: Promo | null = null;
  tab: 'games' | 'review' = 'games';
  depth = 16;
  optArrow = true;
  optEngine = false;
  optVs = false;
  progress: { i: number; n: number; text: string; err: boolean; show: boolean } = { i: 0, n: 0, text: '', err: false, show: false };
  pgnErr = '';
  clsCursor: { color: Color; cls: string; index: number } | null = null;
  P = blankPuzzle();
  engine = new Engine();
  private exploreJob = 0;
  private pzFlash = 0;
  private pzLoading: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private snap = { v: 0 };

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };
  getSnapshot = () => this.snap;
  emit() {
    this.snap = { v: this.snap.v + 1 };
    for (const l of this.listeners) l();
  }

  init() {
    const q = new URLSearchParams(location.search).get('user');
    this.user = q || localStorage.getItem('cr-user') || 'LucasMazza';
    const d = localStorage.getItem('cr-depth');
    if (d) this.depth = +d || 16;
    this.emit();
    void this.loadUser();
    void loadBook();
    void this.ensurePuzzles();
    this.engine.init().catch((e) => console.warn('engine preload failed', e));
  }

  setMode(mode: 'review' | 'puzzles') {
    if (this.mode === mode) return;
    this.P.token++;
    this.pzFlash++;
    if (this.P.busy && this.P.puzzle) this.resetLine();
    this.sel = null;
    this.promo = null;
    this.mode = mode;
    if (mode === 'puzzles') void this.ensurePuzzles();
    this.emit();
  }

  setTab(t: 'games' | 'review') {
    this.tab = t;
    this.emit();
  }

  setDepth(n: number) {
    this.depth = n;
    localStorage.setItem('cr-depth', String(n));
    this.emit();
    if (this.mode === 'puzzles') return;
    if (this.game) void this.startReview(this.game, this.flipped ? 'b' : 'w');
  }
  setOpt(which: 'arrow' | 'engine', on: boolean) {
    if (which === 'arrow') this.optArrow = on;
    else this.optEngine = on;
    this.emit();
  }

  async loadUser(name?: string) {
    const u = (name ?? this.user).trim();
    if (!u) return;
    this.user = u;
    localStorage.setItem('cr-user', u);
    this.gamesStatus = 'Loading archives…';
    this.gamesErr = false;
    this.monthGames = [];
    this.emit();
    try {
      const d = await api(`https://api.chess.com/pub/player/${encodeURIComponent(u.toLowerCase())}/games/archives`) as { archives?: string[] };
      this.archives = d.archives || [];
      if (!this.archives.length) {
        this.gamesStatus = 'No games found.';
        this.emit();
        return;
      }
      this.monthIdx = this.archives.length - 1;
      await this.loadMonth();
    } catch (e) {
      this.gamesStatus = e instanceof Error ? e.message : 'Could not load games.';
      this.gamesErr = true;
      this.emit();
    }
  }

  async loadMonth() {
    const url = this.archives[this.monthIdx];
    if (!url) return;
    this.gamesStatus = 'Loading games…';
    this.gamesErr = false;
    this.monthGames = [];
    this.emit();
    try {
      const d = await api(url) as { games?: ChessComGame[] };
      this.monthGames = (d.games || []).slice().sort((a, b) => b.end_time - a.end_time);
      const n = this.monthGames.length;
      this.gamesStatus = `${n} game${n === 1 ? '' : 's'} · click one to review`;
      this.emit();
    } catch (e) {
      this.gamesStatus = e instanceof Error ? e.message : 'Could not load games.';
      this.gamesErr = true;
      this.emit();
    }
  }
  prevMonth() {
    if (this.monthIdx > 0) { this.monthIdx--; void this.loadMonth(); }
  }
  nextMonth() {
    if (this.monthIdx < this.archives.length - 1) { this.monthIdx++; void this.loadMonth(); }
  }

  openChessCom(g: ChessComGame) {
    if (g.rules !== 'chess') {
      window.alert('Only standard chess games can be reviewed (this one is ' + g.rules + ').');
      return;
    }
    try {
      const game = buildGame(g.pgn, g);
      const color = g.black.username.toLowerCase() === this.user.toLowerCase() ? 'b' : 'w';
      void this.startReview(game, color);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not open that game.');
    }
  }
  openPgn(text: string) {
    this.pgnErr = '';
    try {
      const game = buildGame(text.trim(), null);
      const me = this.user.toLowerCase();
      void this.startReview(game, (game.headers.Black || '').toLowerCase() === me ? 'b' : 'w');
    } catch (e) {
      this.pgnErr = e instanceof Error ? e.message : 'Could not parse that PGN.';
      this.emit();
    }
  }

  boardFlipped() {
    return this.mode === 'puzzles' ? this.P.flipped : this.flipped;
  }
  displayed() {
    if (this.mode === 'puzzles') {
      return { fen: this.P.fen || START_FEN, move: this.P.lastMove, ev: null as Ev | null, exploring: false };
    }
    const g = this.game;
    if (!g) return { fen: START_FEN, move: null as { from: string; to: string; cls?: string | null } | null, ev: null as Ev | null, exploring: false };
    const x = this.explore;
    if (x) {
      const move = x.idx > 0 ? x.moves[x.idx - 1] : x.anchor > 0 ? g.moves[x.anchor - 1] : null;
      const ev = x.evals[x.idx] || (x.idx === 0 && g.evals ? g.evals[x.anchor] : null);
      return { fen: x.fens[x.idx], move, ev, exploring: true };
    }
    return { fen: g.fens[this.ply], move: this.ply > 0 ? g.moves[this.ply - 1] : null, ev: g.evals ? g.evals[this.ply] : null, exploring: false };
  }

  arrows(): Arrow[] {
    const out: Arrow[] = [];
    const push = (uci: string | null | undefined, color: string) => {
      if (!uci || uci.length < 4 || uci === '(none)') return;
      out.push({ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color });
    };
    if (this.mode === 'puzzles') {
      const P = this.P;
      if (P.hint >= 2 && P.phase === 'user' && P.puzzle && P.puzzle.solution[P.step]) push(P.puzzle.solution[P.step], '#81b64c');
      return out;
    }
    const g = this.game;
    if (!g || !g.evals) return out;
    const x = this.explore;
    if (x && x.idx > 0) {
      const m = x.moves[x.idx - 1];
      const prev = x.evals[x.idx - 1];
      if (this.optArrow && m && m.cls && prev && prev.best && !['best', 'book', 'brilliant', 'great'].includes(m.cls) && prev.best !== m.uci) push(prev.best, '#81b64c');
      const cur = x.evals[x.idx];
      if (cur && cur.best) push(cur.best, '#4a90d9');
      const l2 = cur && cur.lines && cur.lines[2];
      if (l2 && l2.pv && l2.pv[0] && l2.pv[0] !== cur.best) push(l2.pv[0], '#9ec7f0');
      const l3 = cur && cur.lines && cur.lines[3];
      if (l3 && l3.pv && l3.pv[0] && l3.pv[0] !== cur?.best && (!l2 || l3.pv[0] !== l2.pv[0])) push(l3.pv[0], '#c5d9ee');
      return out;
    }
    const ply = x ? x.anchor : this.ply;
    if (this.optArrow && ply > 0) {
      const m = g.moves[ply - 1];
      const prev = g.evals[ply - 1];
      if (m && m.cls && prev && prev.best && !['best', 'book', 'brilliant', 'great'].includes(m.cls) && prev.best !== m.uci) push(prev.best, '#81b64c');
    }
    if (this.optEngine && g.evals[ply] && g.evals[ply].best) push(g.evals[ply]!.best, '#4a90d9');
    return out;
  }

  canDrag(color: Color) {
    if (this.mode === 'puzzles') {
      if (this.P.phase !== 'user' || this.P.busy || !this.P.fen) return false;
      return color === chessAt(this.P.fen).turn();
    }
    if (!this.game || !this.game.done || (this.explore && this.explore.busy) || this.promo) return false;
    const fen = this.displayed().fen;
    let ch;
    try { ch = chessAt(fen); } catch { return false; }
    if (ch.isGameOver()) return false;
    if (color !== ch.turn()) return false;
    const x = this.explore;
    if (x && x.vsEngine && x.userColor && color !== x.userColor) return false;
    return true;
  }

  clickSquare(name: string) {
    if (this.promo) { this.promo = null; this.sel = null; this.emit(); return; }
    if (this.mode === 'puzzles') {
      if (this.P.phase !== 'user' || this.P.busy || !this.P.fen) return;
      const ch = chessAt(this.P.fen);
      if (this.sel && this.sel.tos.has(name)) { this.puzzleTry(this.sel.from, name); return; }
      const piece = ch.get(name as never);
      if (piece && piece.color === ch.turn()) {
        const legal = legalMoves(ch, name);
        if (!legal.length) { this.sel = null; this.emit(); return; }
        this.sel = { from: name, tos: new Set(legal.map((m) => m.to)), caps: new Set(legal.filter((m) => m.captured).map((m) => m.to)) };
        this.emit();
        return;
      }
      if (this.sel) { this.sel = null; this.emit(); }
      return;
    }
    if (!this.game || !this.game.done || (this.explore && this.explore.busy)) return;
    const fen = this.displayed().fen;
    const ch = chessAt(fen);
    if (ch.isGameOver()) { this.sel = null; this.emit(); return; }
    if (this.sel && this.sel.tos.has(name)) { this.beginMove(this.sel.from, name); return; }
    const piece = ch.get(name as never);
    if (piece && piece.color === ch.turn() && this.canDrag(piece.color)) {
      const legal = legalMoves(ch, name);
      if (!legal.length) { this.sel = null; this.emit(); return; }
      this.sel = { from: name, tos: new Set(legal.map((m) => m.to)), caps: new Set(legal.filter((m) => m.captured).map((m) => m.to)) };
      this.emit();
      return;
    }
    if (this.sel) { this.sel = null; this.emit(); }
  }

  /** Returns true when the piece should stay on the target square. */
  drop(from: string, to: string | null) {
    if (!to) return false;
    if (this.mode === 'puzzles') {
      const before = this.P.fen;
      this.puzzleTry(from, to);
      return this.P.fen !== before && !this.promo;
    }
    if (!this.game || !this.game.done || (this.explore && this.explore.busy) || this.promo) return false;
    const fen = this.displayed().fen;
    const ch = chessAt(fen);
    const opts = legalMoves(ch, from).filter((m) => m.to === to);
    if (!opts.length || !this.canDrag(opts[0].color)) return false;
    if (opts.some((m) => m.promotion)) {
      this.promo = { from, to, color: opts[0].color };
      this.sel = null;
      this.emit();
      return false;
    }
    const mv = tryMove(ch, { from, to });
    if (!mv) return false;
    void this.commitUserMove(mv, ch.fen(), fen);
    return true;
  }

  beginMove(from: string, to: string) {
    const fen = this.displayed().fen;
    const ch = chessAt(fen);
    const opts = legalMoves(ch, from).filter((m) => m.to === to);
    if (!opts.length) return;
    if (opts.some((m) => m.promotion)) {
      this.promo = { from, to, color: opts[0].color };
      this.sel = null;
      this.emit();
      return;
    }
    const mv = tryMove(ch, { from, to });
    if (!mv) return;
    void this.commitUserMove(mv, ch.fen(), fen);
  }
  finishPromo(piece: string) {
    const p = this.promo;
    if (!p) return;
    if (this.mode === 'puzzles') {
      this.promo = null;
      this.sel = null;
      this.puzzleTry(p.from, p.to, piece);
      return;
    }
    const fen = this.displayed().fen;
    const ch = chessAt(fen);
    const mv = tryMove(ch, { from: p.from, to: p.to, promotion: piece });
    this.promo = null;
    this.sel = null;
    if (!mv) { this.emit(); return; }
    void this.commitUserMove(mv, ch.fen(), fen);
  }
  cancelPromo() {
    if (!this.promo) return;
    this.promo = null;
    this.emit();
  }

  goto(p: number) {
    if (this.mode === 'puzzles' || !this.game) return;
    this.sel = null;
    this.promo = null;
    this.ply = clamp(p, 0, this.game.fens.length - 1);
    this.emit();
  }
  prev() {
    if (this.mode === 'puzzles') return;
    if (this.stepExplore(-1)) return;
    this.goto(this.ply - 1);
  }
  next() {
    if (this.mode === 'puzzles') return;
    if (this.stepExplore(1)) return;
    this.goto(this.ply + 1);
  }
  stepEnds(toEnd: boolean) {
    if (this.mode === 'puzzles') return;
    if (this.explore && this.explore.moves.length) {
      this.sel = null;
      this.promo = null;
      this.explore.idx = toEnd ? this.explore.moves.length : 0;
      this.explore.lines = linesOf(this.explore.evals[this.explore.idx]);
      this.emit();
      return;
    }
    this.goto(toEnd ? 1e9 : 0);
  }
  flip() {
    if (this.mode === 'puzzles') { this.P.flipped = !this.P.flipped; this.emit(); return; }
    this.flipped = !this.flipped;
    this.emit();
  }
  clickMove(ply: number) {
    if (this.explore) { this.invalidateExplore(); this.explore = null; this.sel = null; this.promo = null; }
    this.goto(ply);
  }
  clickVar(idx: number) {
    if (!this.explore) return;
    this.stepExplore(idx - this.explore.idx);
  }

  classPlies(color: Color, cls: string) {
    const out: number[] = [];
    if (!this.game) return out;
    this.game.moves.forEach((m, i) => { if (m.color === color && m.cls === cls) out.push(i + 1); });
    return out;
  }
  jumpClass(color: Color, cls: string) {
    if (this.mode === 'puzzles' || !this.game || !this.game.done) return;
    const plies = this.classPlies(color, cls);
    if (!plies.length) return;
    if (this.explore) { this.invalidateExplore(); this.explore = null; this.sel = null; this.promo = null; }
    const at = plies.indexOf(this.ply);
    let index: number;
    if (this.clsCursor && this.clsCursor.color === color && this.clsCursor.cls === cls) index = ((at >= 0 ? at : this.clsCursor.index) + 1) % plies.length;
    else index = 0;
    this.clsCursor = { color, cls, index };
    this.goto(plies[index]);
  }
  graphClick(e: { clientX: number; clientY: number; currentTarget: EventTarget & Element; target: EventTarget | null }) {
    if (!this.game || this.mode === 'puzzles') return;
    const r = e.currentTarget.getBoundingClientRect();
    let p = Math.round((e.clientX - r.left) / r.width * (this.game.fens.length - 1));
    const el = e.target as Element | null;
    const dot = el && el.closest ? el.closest('.gdot') : null;
    if (dot) p = +(dot.getAttribute('data-ply') || 0);
    else {
      let best: number | null = null;
      let bestD = 12;
      e.currentTarget.querySelectorAll('.gdot').forEach((d) => {
        const box = d.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2));
        if (dist < bestD) { bestD = dist; best = +(d.getAttribute('data-ply') || 0); }
      });
      if (best != null) p = best;
    }
    if (this.explore) { this.invalidateExplore(); this.explore = null; this.sel = null; this.promo = null; }
    this.goto(p);
  }

  private setProgress(i: number, n: number, text: string, err = false) {
    this.progress = { i, n, text, err, show: true };
    this.emit();
  }
  private pruneCache() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE_VER + ':')).slice(0, 20).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }

  async startReview(game: Game, preferColor: Color) {
    const gen = ++this.gen;
    this.exploreJob++;
    this.explore = null;
    this.sel = null;
    this.promo = null;
    this.clsCursor = null;
    this.engine.stop();
    this.game = game;
    this.ply = 0;
    this.flipped = preferColor === 'b';
    this.tab = 'review';
    this.progress.show = true;
    this.emit();
    const depth = this.depth;
    const key = `${CACHE_VER}:${game.id}:${depth}`;
    let cached: Ev[] | null = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null') as Ev[] | null; } catch { cached = null; }
    await loadBook();
    if (gen !== this.gen) return;
    const total = game.fens.length;
    game.evals = new Array(total).fill(null);
    if (cached && cached.length === total) {
      game.evals = cached;
      this.setProgress(total, total, 'Loaded cached analysis');
    } else {
      this.setProgress(0, total, 'Loading Stockfish…');
      try { await this.engine.init(); } catch (e) {
        this.setProgress(0, total, 'Engine failed: ' + (e instanceof Error ? e.message : String(e)), true);
        console.error(e);
        return;
      }
      if (gen !== this.gen) return;
      await this.engine.newGame();
      const t0 = performance.now();
      for (let i = 0; i < total; i++) {
        if (gen !== this.gen) return;
        let ev = terminalEval(game.fens[i]);
        if (!ev) {
          const r = await this.engine.analyse(game.fens[i], depth, { multipv: 2 });
          if (gen !== this.gen) return;
          const l1 = r.lines[1] || { ev: { cp: 0, mate: null }, pv: [] as string[] };
          ev = { ...l1.ev, best: r.best && r.best !== '(none)' ? r.best : (l1.pv[0] || null), pv: l1.pv.slice(0, 12) };
          if (r.lines[2]) ev.second = r.lines[2].ev;
        }
        game.evals[i] = ev;
        const el = (performance.now() - t0) / 1000;
        this.setProgress(i + 1, total, `Analyzing move ${Math.ceil(i / 2)} of ${Math.ceil((total - 1) / 2)} · depth ${depth}` + (i > 3 ? ` · ~${Math.round(el / (i + 1) * (total - i - 1))}s left` : ''));
      }
      try { localStorage.setItem(key, JSON.stringify(game.evals)); } catch { this.pruneCache(); }
    }
    classify(game);
    game.done = true;
    this.setProgress(total, total, 'Analysis complete');
    window.setTimeout(() => { if (gen === this.gen) { this.progress = { ...this.progress, show: false }; this.emit(); } }, 600);
    this.emit();
  }

  private invalidateExplore() {
    this.exploreJob++;
    if (this.game && this.game.done && this.engine.w) this.engine.stop();
  }
  private ensureExplore() {
    if (this.explore) return this.explore;
    const ev = this.game?.evals ? cloneEval(this.game.evals[this.ply]) : null;
    this.explore = {
      anchor: this.ply,
      moves: [],
      fens: [this.game!.fens[this.ply]],
      evals: [ev],
      idx: 0,
      vsEngine: this.optVs,
      userColor: null,
      lines: linesOf(ev),
      busy: false,
      pendingEngine: false,
    };
    return this.explore;
  }
  private gameOver(fen: string) {
    try { return chessAt(fen).isGameOver(); } catch { return true; }
  }
  private shouldEngineMove() {
    const x = this.explore;
    if (!x || !x.vsEngine || !x.userColor) return false;
    const fen = x.fens[x.idx];
    if (this.gameOver(fen)) return false;
    return chessAt(fen).turn() !== x.userColor;
  }
  backToGame() {
    this.invalidateExplore();
    const anchor = this.explore ? this.explore.anchor : this.ply;
    this.explore = null;
    this.sel = null;
    this.promo = null;
    this.ply = clamp(anchor, 0, this.game ? this.game.fens.length - 1 : 0);
    this.emit();
  }
  undoExplore() {
    const x = this.explore;
    if (!x || !x.moves.length) return;
    this.invalidateExplore();
    x.pendingEngine = false;
    x.busy = false;
    x.moves.pop();
    x.fens.pop();
    x.evals.pop();
    x.idx = x.moves.length;
    x.lines = linesOf(x.evals[x.idx]);
    this.sel = null;
    this.promo = null;
    if (!x.moves.length) { this.backToGame(); return; }
    this.emit();
  }
  private stepExplore(delta: number) {
    const x = this.explore;
    if (!(x && x.moves.length)) return false;
    const n = clamp(x.idx + delta, 0, x.moves.length);
    if (n === x.idx) return true;
    this.sel = null;
    this.promo = null;
    x.idx = n;
    x.lines = linesOf(x.evals[x.idx]);
    this.emit();
    return true;
  }
  async setVsEngine(on: boolean) {
    this.optVs = on;
    if (!this.explore) { this.emit(); return; }
    this.explore.vsEngine = on;
    this.emit();
    if (!on || this.explore.busy) return;
    if (!this.explore.userColor) this.explore.userColor = this.explore.moves[0] ? this.explore.moves[0].color : chessAt(this.explore.fens[this.explore.idx]).turn();
    if (this.explore.idx === this.explore.moves.length && this.shouldEngineMove()) {
      if (this.explore.evals[this.explore.idx] && this.explore.evals[this.explore.idx]!.best) await this.engineReply();
      else { this.explore.pendingEngine = true; await this.searchTip(); }
    }
  }
  private async searchTip() {
    const x = this.explore;
    if (!x || !this.game || !this.game.done) return;
    const job = ++this.exploreJob;
    if (this.engine.w) this.engine.stop();
    const fen = x.fens[x.idx];
    x.busy = true;
    this.emit();
    let after = terminalEval(fen);
    if (!after && this.gameOver(fen)) after = { cp: 0, mate: null, best: null, pv: [], lines: {} };
    if (!after) {
      try { await this.engine.init(); } catch { x.busy = false; this.emit(); return; }
      if (job !== this.exploreJob || !this.explore) return;
      try {
        const r = await this.engine.analyse(fen, this.depth, {
          multipv: 3,
          movetime: 2800,
          onUpdate: (lines) => {
            if (job !== this.exploreJob || !this.explore) return;
            const ev = packResult({ lines, best: lines[1] && lines[1].pv && lines[1].pv[0] });
            this.explore.evals[this.explore.idx] = ev;
            this.explore.lines = ev.lines || null;
            this.emit();
          },
        });
        if (job !== this.exploreJob || !this.explore) return;
        after = packResult(r);
      } catch (e) {
        console.error(e);
        if (this.explore) this.explore.busy = false;
        return;
      }
    }
    if (job !== this.exploreJob || !this.explore) return;
    x.evals[x.idx] = after;
    x.lines = after.lines || linesOf(after);
    const m = x.idx > 0 ? x.moves[x.idx - 1] : null;
    const before = m ? x.evals[x.idx - 1] : null;
    if (m && before) {
      const prev = x.idx >= 2 ? x.moves[x.idx - 2] : x.anchor > 0 ? this.game.moves[x.anchor - 1] : null;
      const bookHit = classifyOne(m, before, after, x.fens[x.idx - 1], {
        prev, plyIndex: x.anchor + x.idx - 1, isStd: this.game.isStd, fenAfter: fen, legal: m.legal,
      });
      if (bookHit) m.opening = bookHit[1];
      m.evalAfter = after;
    }
    x.busy = false;
    this.emit();
    if (job !== this.exploreJob || !this.explore) return;
    if (x.pendingEngine) {
      x.pendingEngine = false;
      if (this.shouldEngineMove()) await this.engineReply();
    }
  }
  private async engineReply() {
    const x = this.explore;
    if (!x || x.busy) return;
    const ev = x.evals[x.idx];
    const uci = ev && (ev.best || (ev.pv && ev.pv[0]));
    if (!uci || uci === '(none)') return;
    const fenBefore = x.fens[x.idx];
    const ch = chessAt(fenBefore);
    const mv = tryMove(ch, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    if (!mv) return;
    this.pushVariationMove(mv, ch.fen(), fenBefore);
    x.pendingEngine = false;
    this.emit();
    await this.searchTip();
  }
  private pushVariationMove(mv: Move, fenAfter: string, fenBefore: string) {
    const x = this.explore!;
    x.moves.length = x.idx;
    x.fens.length = x.idx + 1;
    x.evals.length = x.idx + 1;
    x.moves.push({
      san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion || null, captured: mv.captured || null,
      color: mv.color, uci: uciOf(mv), legal: legalMoves(chessAt(fenBefore)).length,
    });
    x.fens.push(fenAfter);
    x.evals.push(null);
    x.idx = x.moves.length;
    x.lines = null;
  }
  private async commitUserMove(mv: Move, fenAfter: string, fenBefore: string) {
    if (!this.game || !this.game.done) return;
    const uci = uciOf(mv);
    const onGameMove = this.ply < this.game.moves.length && this.game.moves[this.ply].uci === uci && (!this.explore || this.explore.idx === 0);
    if (onGameMove) {
      if (this.explore) this.backToGame();
      else { this.sel = null; this.promo = null; }
      this.goto(this.ply + 1);
      return;
    }
    const x = this.ensureExplore();
    if (x.vsEngine && x.userColor && mv.color !== x.userColor) { this.sel = null; this.promo = null; this.emit(); return; }
    if (!x.userColor) x.userColor = mv.color;
    x.vsEngine = this.optVs;
    this.pushVariationMove(mv, fenAfter, fenBefore);
    x.pendingEngine = !!x.vsEngine;
    this.sel = null;
    this.promo = null;
    this.emit();
    await this.searchTip();
  }

  /* puzzles */
  todayList(): Puzzle[] {
    return this.P.set ? (['easy', 'medium', 'hard'] as Level[]).flatMap((level) => this.P.set![level] || []) : [];
  }
  async ensurePuzzles() {
    if (!this.P.db) {
      if (!this.pzLoading) {
        const url = import.meta.env.BASE_URL + 'puzzles.json';
        this.pzLoading = fetch(url).then((r) => {
          if (!r.ok) throw new Error('Could not load puzzles (' + r.status + ')');
          return r.json();
        }).then((db: PuzzleDB) => { this.P.db = db; this.P.err = ''; }).catch((e: unknown) => {
          this.P.err = e instanceof Error ? e.message : 'Could not load puzzles.';
        });
      }
      await this.pzLoading;
    }
    if (this.P.err || !this.P.db) { this.emit(); return; }
    const date = new Date().toISOString().slice(0, 10);
    if (this.P.date !== date || !this.P.set) {
      this.P.date = date;
      const set = {} as Record<Level, Puzzle[]>;
      for (const level of ['easy', 'medium', 'hard'] as Level[]) {
        set[level] = pickN(this.P.db.buckets[level] || [], 2, hashStr(date + ':' + level)).map((p) => ({ ...p, level }));
      }
      this.P.set = set;
    }
    this.emit();
  }
  private resetLine() {
    const P = this.P;
    if (!P.puzzle) return;
    P.fen = P.startFen;
    P.lastMove = P.startLast;
    P.step = 0;
    P.phase = 'user';
    P.busy = false;
    P.feedback = '';
    P.hint = 0;
    P.bad = null;
    P.note = '';
  }
  openPuzzle(p: Puzzle) {
    const P = this.P;
    P.token++;
    this.pzFlash++;
    P.puzzle = p;
    P.view = 'play';
    P.startFen = p.fen;
    P.fen = p.fen;
    P.startLast = p.lastMove ? { from: p.lastMove.slice(0, 2), to: p.lastMove.slice(2, 4) } : null;
    P.lastMove = P.startLast;
    P.step = 0;
    P.phase = 'user';
    P.feedback = '';
    P.note = '';
    P.hint = 0;
    P.bad = null;
    P.busy = false;
    P.hintUsed = (pzRec(P.date, p.id) || {}).hint || 0;
    P.level = p.level || P.level;
    P.flipped = chessAt(p.fen).turn() === 'b';
    this.sel = null;
    this.promo = null;
    this.emit();
  }
  puzzleTry(from: string, to: string, promotion?: string) {
    const P = this.P;
    if (this.mode !== 'puzzles' || !P.puzzle || P.phase !== 'user' || P.busy) return;
    const ch = chessAt(P.fen);
    const legal = legalMoves(ch, from).filter((m) => m.to === to);
    if (!legal.length) return;
    if (!promotion && legal.some((m) => m.promotion)) {
      this.promo = { from, to, color: legal[0].color };
      this.emit();
      return;
    }
    const mv = tryMove(ch, { from, to, promotion });
    if (!mv) return;
    const uci = uciOf(mv);
    const expect = P.puzzle.solution[P.step];
    this.sel = null;
    this.promo = null;
    P.note = '';
    this.pzFlash++;
    if (uci !== expect) {
      P.feedback = 'wrong';
      P.bad = { from, to };
      this.emit();
      const flash = this.pzFlash;
      window.setTimeout(() => {
        if (flash !== this.pzFlash) return;
        P.bad = null;
        if (P.feedback === 'wrong') P.feedback = '';
        this.emit();
      }, 700);
      return;
    }
    P.feedback = 'right';
    P.bad = null;
    P.hint = 0;
    this.applyUci(uci);
    P.step++;
    if (P.step >= P.puzzle.solution.length) { this.finishSolved(); return; }
    const reply = P.puzzle.solution[P.step];
    P.phase = 'reply';
    P.busy = true;
    this.emit();
    const token = ++P.token;
    window.setTimeout(() => {
      if (token !== P.token || this.mode !== 'puzzles') return;
      const played = this.applyUci(reply);
      P.step++;
      P.busy = false;
      if (P.step >= P.puzzle!.solution.length) this.finishSolved();
      else {
        P.phase = 'user';
        P.feedback = '';
        P.note = played ? `Opponent played ${played.san}. Your turn.` : '';
        this.emit();
      }
    }, 450);
  }
  private applyUci(uci: string) {
    const ch = chessAt(this.P.fen);
    const mv = tryMove(ch, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!mv) return null;
    this.P.fen = ch.fen();
    this.P.lastMove = { from: mv.from, to: mv.to, san: mv.san };
    return mv;
  }
  private finishSolved() {
    const P = this.P;
    P.phase = 'solved';
    P.feedback = 'solved';
    P.busy = false;
    P.note = '';
    const cur = pzRec(P.date, P.puzzle!.id);
    pzWrite(P.date, P.puzzle!.id, { status: 'solved', hint: Math.max(P.hintUsed, (cur && cur.hint) || 0) });
    this.emit();
    this.scheduleAuto();
  }
  onHint() {
    const P = this.P;
    if (!P.puzzle || P.phase !== 'user' || P.busy) return;
    P.hint = Math.min(2, P.hint + 1);
    P.hintUsed = Math.max(P.hintUsed, P.hint);
    const cur = pzRec(P.date, P.puzzle.id) || { status: null, hint: 0 };
    pzWrite(P.date, P.puzzle.id, { status: cur.status || null, hint: P.hintUsed });
    this.emit();
  }
  async showSolution() {
    const P = this.P;
    if (!P.puzzle || P.phase === 'show' || P.busy) return;
    const cur = pzRec(P.date, P.puzzle.id) || { status: null, hint: 0 };
    const already = P.phase === 'solved' || cur.status === 'solved';
    if (!already) pzWrite(P.date, P.puzzle.id, { status: 'failed', hint: Math.max(P.hintUsed, cur.hint || 0) });
    const token = ++P.token;
    this.pzFlash++;
    P.busy = true;
    P.phase = 'show';
    P.hint = 0;
    P.bad = null;
    P.feedback = '';
    P.note = '';
    P.fen = P.startFen;
    P.lastMove = P.startLast;
    P.step = 0;
    this.sel = null;
    this.promo = null;
    this.emit();
    for (let i = 0; i < P.puzzle.solution.length; i++) {
      await new Promise((r) => window.setTimeout(r, 480));
      if (token !== P.token) return;
      if (!this.applyUci(P.puzzle.solution[i])) break;
      P.step = i + 1;
      this.emit();
    }
    if (token !== P.token) return;
    P.busy = false;
    P.phase = already ? 'solved' : 'failed';
    P.feedback = P.phase;
    this.emit();
  }
  retryPuzzle() {
    const P = this.P;
    if (!P.puzzle) return;
    P.token++;
    this.pzFlash++;
    this.resetLine();
    this.sel = null;
    this.promo = null;
    this.emit();
  }
  puzzleBack() {
    this.P.token++;
    this.pzFlash++;
    if (this.P.busy) this.resetLine();
    this.P.view = 'list';
    this.sel = null;
    this.promo = null;
    this.emit();
  }
  setLevel(level: Level) {
    this.P.level = level;
    this.P.view = 'list';
    this.emit();
  }
  setAuto(on: boolean) {
    setAutoAdvance(on);
    this.emit();
  }
  puzzleDone() {
    return this.mode === 'puzzles' && this.P.view === 'play' && (this.P.phase === 'solved' || this.P.phase === 'failed');
  }
  allSolvedToday() {
    const list = this.todayList();
    return list.length === 6 && list.every((p) => (pzRec(this.P.date, p.id) || {}).status === 'solved');
  }
  nextUnsolvedPuzzle() {
    const list = this.todayList();
    if (!list.length || !this.P.puzzle) return null;
    const idx = list.findIndex((p) => p.id === this.P.puzzle!.id);
    const start = idx < 0 ? 0 : idx;
    for (let i = 1; i <= list.length; i++) {
      const p = list[(start + i) % list.length];
      if ((pzRec(this.P.date, p.id) || {}).status === 'solved') continue;
      if (p.id === this.P.puzzle.id) return null;
      return p;
    }
    return null;
  }
  nextLabel() {
    if (this.nextUnsolvedPuzzle()) return 'Next puzzle →';
    if (this.allSolvedToday()) return 'All done for today →';
    return "Today's progress →";
  }
  private scheduleAuto() {
    if (!autoAdvanceOn() || this.P.phase !== 'solved') return;
    const token = this.P.token;
    window.setTimeout(() => {
      if (token !== this.P.token || this.mode !== 'puzzles' || this.P.phase !== 'solved' || !autoAdvanceOn()) return;
      this.nextPuzzle();
    }, 1500);
  }
  nextPuzzle() {
    if (this.mode !== 'puzzles') return;
    const nxt = this.nextUnsolvedPuzzle();
    this.P.token++;
    this.pzFlash++;
    if (nxt) { this.openPuzzle(nxt); return; }
    this.showDone();
  }
  showDone() {
    this.P.view = 'done';
    this.P.phase = 'done';
    this.P.busy = false;
    this.P.hint = 0;
    this.sel = null;
    this.promo = null;
    this.emit();
    if (window.matchMedia('(max-width: 979px)').matches) {
      document.getElementById('puzzleBody')?.scrollIntoView({ block: 'start' });
    }
  }
  streak() { return streak(this.P.db); }
}

export const session = new Session();
