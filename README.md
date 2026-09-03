# Broad-Phase Collision — Spatial Hash Grid

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/broad-phase-collision-spatial-hash/)** · [Source](https://github.com/m2-md/broad-phase-collision-spatial-hash)
<!-- LINKS:END -->

> Broad-phase 2D collision detection: comparing naive O(n²) pairwise checks against a
> spatial hash grid and a quadtree, from 200 objects to 20,000.

Working code for the article "Shaking Hands with Everyone: Broad-Phase Collision
and the Spatial Hash Grid from 200 Objects to 20,000". It takes the naive O(n²)
pair-by-pair collision test down to near-linear with a spatial hash grid — without
touching a single line of the narrow phase.

This project builds on top of the `canvas-physics-from-scratch` engine: `Vec2`,
`Body` and the `collideBodies`/`collideWalls` narrow-phase logic come from there.
The only thing that changes is replacing the naive double loop inside
`World.step()` with a broad → narrow pipeline.

## Contents

- `src/grid.ts` — `SpatialHashGrid<T>`: insertion into every cell an AABB touches,
  `queryPairs()` deduplicated with an id-ordered `lo*n+hi` key, `insertSwept()` for
  swept AABBs.
- `src/quadtree.ts` — `QuadTree<T>`: an alternative broad phase that subdivides by
  occupancy; produces each candidate pair exactly once (no dedup needed).
- `src/overlap.ts` — `circlesOverlap`: a squared-distance test with no square root.
- `src/benchmark.ts` — deterministic scene generation (mulberry32) + naive/grid/quadtree
  candidate count comparison + cell size sweep.
- `src/world.ts` — the engine's `step()` with the broad → narrow pipeline.
- `src/demo.ts` + `index.html` — live canvas demo.

## Setup

```bash
npm install
```

## Running

> **Do not double-click `index.html` and open it directly.** The demo loads a
> TypeScript module (`<script type="module" src="/src/demo.ts">`); the browser
> cannot run a `.ts` file on its own. If you open it with `file://` you get a blank
> screen. The `npm run dev` (Vite) command below compiles the TypeScript and serves
> it to the browser — that is the **only** way to run it.

### Live demo (the FPS cliff)

```bash
npm install   # once
npm run dev
```

`http://localhost:5173/` opens. The buttons in the top right:

- **+500 bodies** — adds 500 circles on every press.
- **naive / grid toggle** — switches the broad phase between naive O(n²) and the grid.

HUD in the top left: live FPS, body count, active mode, cell size and **where the
time goes** — the number of `candidate pairs` reaching the narrow phase in that
frame + the `broad` (grid build/query) and `narrow` (collision resolution) times
separately.

When you switch to naive mode, FPS falls off the cliff at a few hundred bodies —
that is O(n²). Grid mode carries thousands of bodies comfortably; but remember: the
broad phase makes candidate *generation* cheap, not resolving the contacts. When
bodies pile up **densely** at the bottom, the candidate pair count swells in
proportion to the real neighbor count and grid mode slows down too. There are two
levers: (1) **cell size** — keep it at ~1–2× the diameter; if you pick it too large
(16 instead of 48 in this demo, for radius-6 bodies) dozens of bodies land in each
cell and the candidate count explodes; (2) **allocations** in the hot loop (new
`Vec2` and pair arrays every frame) — that is the subject of the object pooling
article.

### Tests

```bash
npm test
```

4 tests, proving the broad phase **misses no real collision**:

1. The grid's filtered candidates are exactly equal to the brute-force O(n²) overlap set.
2. The same pair is never produced twice (no double counting).
3. A large body spanning several cells matches all three of its three small neighbors.
4. The same parity check also passes for `QuadTree.queryPairs()`.

### Benchmark

```bash
npm run bench
```

Runs `benchmark(200)`, `benchmark(2000)`, `benchmark(20000)` and prints the number
of candidate pairs produced (how many times the narrow phase will be called — a
deterministic metric).

Expected output (constant density, `seed = 1`, `cellSize = 24`):

```
       n    naive n(n-1)/2    grid (cell=24)      quadtree
----------------------------------------------------------
     200            19,900               160         4,451
   2,000         1,999,000             1,418       163,493
  20,000       199,990,000            14,323     4,818,747
```

The naive column climbs quadratically (`n(n-1)/2`); the grid is near-linear and at
20,000 objects produces ~14,000× fewer candidates than naive. The quadtree bridges
the cliff compared to naive but stays behind the grid in this evenly distributed
scene — the quadtree pulls ahead in clustered scenes with varying object sizes.

## File layout

```
src/
  vec.ts        # Vec2 helpers (copied from the engine)
  body.ts       # Body + createBody (copied from the engine)
  world.ts      # World.step: integration → walls → BROAD → NARROW
  grid.ts       # SpatialHashGrid<T>
  quadtree.ts   # QuadTree<T>
  overlap.ts    # circlesOverlap (squared-distance test)
  benchmark.ts  # makeScene / benchmark / sweepCellSize / countNaiveChecks
  bench-cli.ts  # prints the bench table to stdout
  demo.ts       # live canvas demo
test/
  grid.test.ts  # brute-force parity + double counting + large body + quadtree parity
index.html      # demo entry point
```

## Tech stack

- TypeScript
- Vite
- Vitest
- HTML5 Canvas 2D

## License

MIT
