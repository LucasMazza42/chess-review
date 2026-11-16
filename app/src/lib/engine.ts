import type { Ev, Line } from './types';

const SF_VER = '18.0.8';
const SF_JS = `https://unpkg.com/stockfish@${SF_VER}/bin/stockfish-18-lite-single.js`;
const SF_WASM = `https://unpkg.com/stockfish@${SF_VER}/bin/stockfish-18-lite-single.wasm`;
export const MAX_MS = 5000;
export const EXPLORE_MS = 2800;

type Listener = (line: string) => void;
type AnalyseOpts = {
  multipv?: number;
  movetime?: number;
  onUpdate?: (lines: Record<number, { ev: Ev; pv: string[]; depth: number }>) => void;
};

export class Engine {
  ready: Promise<void> | null = null;
  listeners: Listener[] = [];
  private _tail: Promise<void> = Promise.resolve();
  private _mpv = 2;
  w: Worker | null = null;

  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const r = await fetch(SF_JS);
      if (!r.ok) throw new Error('Could not download Stockfish (' + r.status + ')');
      const src = await r.text();
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      this.w = new Worker(url + '#' + encodeURIComponent(SF_WASM));
      this.w.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data);
        this.listeners.slice().forEach((f) => f(line));
      };
      this.w.onerror = (e) => console.warn('engine worker error', e.message || e);
      await this.cmd('uci', (l) => l === 'uciok');
      this.send('setoption name MultiPV value 2');
      this._mpv = 2;
      this.send('setoption name Hash value 64');
      await this.cmd('isready', (l) => l === 'readyok');
    })();
    return this.ready;
  }

  send(c: string) {
    this.w?.postMessage(c);
  }
  cmd(c: string, done: (l: string) => boolean) {
    return new Promise<void>((res) => {
      const f: Listener = (l) => {
        if (done(l)) {
          this.off(f);
          res();
        }
      };
      this.listeners.push(f);
      this.send(c);
    });
  }
  off(f: Listener) {
    this.listeners = this.listeners.filter((x) => x !== f);
  }
  async newGame() {
    this.send('ucinewgame');
    await this.cmd('isready', (l) => l === 'readyok');
  }
  async setMultiPV(n: number) {
    if (this._mpv === n) return;
    this.send('setoption name MultiPV value ' + n);
    await this.cmd('isready', (l) => l === 'readyok');
    this._mpv = n;
  }
  analyse(fen: string, depth: number, opts?: AnalyseOpts) {
    const job = this._tail.then(() => this._analyse(fen, depth, opts || {}));
    this._tail = job.then(() => {}, () => {});
    return job;
  }
  private _analyse(fen: string, depth: number, opts: AnalyseOpts) {
    const turn = fen.split(' ')[1];
    const movetime = opts.movetime || MAX_MS;
    return (async () => {
      if (opts.multipv) await this.setMultiPV(opts.multipv);
      return await new Promise<{ best: string; lines: Record<number, { ev: Ev; pv: string[] }> }>((res) => {
        const lines: Record<number, { ev: Ev; pv: string[]; depth: number }> = {};
        const f: Listener = (l) => {
          if (l.startsWith('info') && l.includes(' pv ') && !l.includes('bound')) {
            const t = l.split(' ');
            const g = (k: string) => {
              const i = t.indexOf(k);
              return i < 0 ? null : t[i + 1];
            };
            const mpv = +(g('multipv') || 1);
            const si = t.indexOf('score');
            if (si < 0) return;
            const typ = t[si + 1];
            const val = +t[si + 2];
            const pv = t.slice(t.indexOf('pv') + 1);
            let ev: Ev = typ === 'mate' ? { cp: null, mate: val } : { cp: val, mate: null };
            if (turn === 'b') ev = ev.mate != null ? { cp: null, mate: -(ev.mate as number) } : { cp: -(ev.cp as number), mate: null };
            lines[mpv] = { ev, pv, depth: +(g('depth') || 0) };
            if (opts.onUpdate && lines[1]) {
              const snap: Record<number, { ev: Ev; pv: string[]; depth: number }> = {};
              for (const k in lines) snap[+k] = { ev: { ...lines[+k].ev }, pv: lines[+k].pv.slice(), depth: lines[+k].depth };
              opts.onUpdate(snap);
            }
          } else if (l.startsWith('bestmove')) {
            this.off(f);
            const best = l.split(' ')[1];
            const out: Record<number, { ev: Ev; pv: string[] }> = {};
            for (const k in lines) out[+k] = { ev: lines[+k].ev, pv: lines[+k].pv };
            res({ best, lines: out });
          }
        };
        this.listeners.push(f);
        this.send('position fen ' + fen);
        this.send('go depth ' + depth + ' movetime ' + movetime);
      });
    })();
  }
  stop() {
    if (this.w) this.send('stop');
  }
}

export function packResult(r: { best?: string; lines: Record<number, { ev: Ev; pv: string[] }> }): Ev {
  const l1 = r.lines[1] || { ev: { cp: 0, mate: null }, pv: [] as string[] };
  const ev: Ev = {
    cp: l1.ev.cp,
    mate: l1.ev.mate,
    best: r.best && r.best !== '(none)' ? r.best : l1.pv[0] || null,
    pv: (l1.pv || []).slice(0, 12),
  };
  if (r.lines[2]) ev.second = { cp: r.lines[2].ev.cp, mate: r.lines[2].ev.mate };
  const lines: Record<number, Line> = {};
  for (const k of [1, 2, 3]) {
    if (r.lines[k]) lines[k] = { ev: { cp: r.lines[k].ev.cp, mate: r.lines[k].ev.mate }, pv: (r.lines[k].pv || []).slice(0, 12) };
  }
  ev.lines = lines;
  return ev;
}
