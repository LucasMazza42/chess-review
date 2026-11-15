# Game Review (Chess.com-style, free)

**Live:** https://lucasmazza42.github.io/chess-review/

A single-file web app that pulls your games from Chess.com's public API and reviews them with Stockfish 18 running in your browser.

![Game Review](screenshot.png)

## Use it

- Open https://lucasmazza42.github.io/chess-review/ (GitHub Pages, served from the `main` branch root).
- The username box defaults to **LucasMazza**. Click **Load games**, pick a month, then click a game to review it.
- `?user=SomeName` in the URL preloads a different Chess.com username (for example https://lucasmazza42.github.io/chess-review/?user=Hikaru).
- Or paste any standard-chess PGN in **Paste a PGN instead**.

Needs an internet connection: Chess.com's public API, plus Stockfish, chess.js, piece images, and the opening list from CDNs (all `https://`).

## Run locally

- **Easiest:** double-click `index.html` (works from `file://`; tested in Chrome).
- **Or serve it:** `./start.sh` (or `python3 -m http.server 8000` in this folder) and open http://localhost:8000.
- The page uses only relative URLs for its own files (it is a single `index.html`) and absolute `https://` URLs for CDN assets, so it also works when the site is hosted under a subpath such as `/chess-review/`.

## Features

- Chess.com username (default LucasMazza) → monthly archives with ‹ › month navigation; list shows color, opponent + rating, your rating, result, time control, date. Click to review. Or paste any PGN.
- Stockfish 18 (lite NNUE, single-threaded WASM from unpkg) in a blob Web Worker; no COOP/COEP headers needed. Depth selectable (default 16) with a 5 s per-position cap.
- Move classifications: Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder (from win-% loss, Lichess win% formula, mates handled).
- Accuracy per player (Lichess formula), classification counts per player, and Chess.com's own accuracy shown alongside when the API provides it.
- Board with move highlights tinted by classification, classification badge, green "best move" arrow when you missed it, optional blue engine arrow for the current position, eval bar, clickable eval graph, move list with icons, coach box ("X was best", best line, engine continuation, win-% change), clocks from the PGN.
- Book moves + opening name from the Lichess chess-openings database (cached).
- Keyboard: ← → step, ↑/Home start, ↓/End end, F flip.
- Analysis is cached in localStorage per game + depth.

## Limitations

- Classifications approximate Chess.com's (their exact algorithm is private); Brilliant uses a simple "piece left en prise" sacrifice check; Great = only move that keeps the advantage (best move ≥20 win% better than the 2nd-best).
- Accuracy uses Lichess's formula, so numbers differ from Chess.com's CAPS.
- Standard chess only (no Chess960 etc.). No Game Rating estimate.
