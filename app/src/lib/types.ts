export type Color = 'w' | 'b';

export type EvCore = { cp: number | null; mate: number | null };
export type Line = { ev: EvCore; pv: string[] };

export type Ev = EvCore & {
  winner?: Color;
  best?: string | null;
  pv?: string[];
  second?: EvCore;
  lines?: Record<number, Line>;
};

export type RMove = {
  san: string;
  from: string;
  to: string;
  promotion: string | null;
  captured: string | null;
  color: Color;
  uci: string;
  legal: number;
  loss?: number;
  acc?: number;
  opening?: string | null;
  cls?: string | null;
  evalAfter?: Ev | null;
};

export type ChessComPlayer = { username: string; rating: number; result: string };
export type ChessComGame = {
  url: string;
  pgn: string;
  rules: string;
  time_class?: string;
  time_control?: string;
  end_time: number;
  white: ChessComPlayer;
  black: ChessComPlayer;
  accuracies?: { white?: number; black?: number };
};

export type Game = {
  headers: Record<string, string>;
  fens: string[];
  legal: number[];
  moves: RMove[];
  clocks: number[] | null;
  startClock: number | null;
  id: string;
  meta: ChessComGame | null;
  startMoveNo: number;
  isStd: boolean;
  opening: string | null;
  eco?: string;
  chessComAcc: { white: number | null; black: number | null } | null;
  evals: (Ev | null)[];
  done: boolean;
  accuracy?: { w: number | null; b: number | null };
};

export type ExploreState = {
  anchor: number;
  moves: RMove[];
  fens: string[];
  evals: (Ev | null)[];
  idx: number;
  vsEngine: boolean;
  userColor: Color | null;
  lines: Record<number, Line> | null;
  busy: boolean;
  pendingEngine: boolean;
};

export type Sel = { from: string; tos: Set<string>; caps: Set<string> };
export type Promo = { from: string; to: string; color: Color };

export type Puzzle = {
  id: string;
  rating: number;
  themes: string[];
  fen: string;
  solution: string[];
  lastMove?: string;
  level: Level;
};
export type Level = 'easy' | 'medium' | 'hard';
export type PuzzleDB = { buckets: Record<Level, Omit<Puzzle, 'level'>[]> };

export type PzRec = { status: 'solved' | 'failed' | null; hint: number };
export type PzPhase = 'user' | 'reply' | 'show' | 'solved' | 'failed' | 'done';

export type PuzzleState = {
  db: PuzzleDB | null;
  date: string;
  level: Level;
  set: Record<Level, Puzzle[]> | null;
  view: 'list' | 'play' | 'done';
  err: string;
  puzzle: Puzzle | null;
  startFen: string;
  startLast: { from: string; to: string } | null;
  fen: string;
  lastMove: { from: string; to: string; san?: string } | null;
  step: number;
  phase: PzPhase;
  feedback: string;
  note: string;
  hint: number;
  hintUsed: number;
  busy: boolean;
  bad: { from: string; to: string } | null;
  flipped: boolean;
  token: number;
};
