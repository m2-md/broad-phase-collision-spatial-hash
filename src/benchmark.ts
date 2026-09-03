import { SpatialHashGrid, type HasBounds } from "./grid";
import { QuadTree } from "./quadtree";

export function countNaiveChecks(n: number): number {
  let checks = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      checks++; // this is where real collideBodies would be called
    }
  }
  return checks;
}

export function sweepCellSize(items: HasBounds[], sizes: number[]) {
  return sizes.map((cellSize) => {
    const grid = new SpatialHashGrid<HasBounds>(cellSize);
    for (const it of items) grid.insert(it);
    const candidates = grid.queryPairs().length;
    return { cellSize, candidates };
  });
}

// mulberry32: small, fast, deterministic PRNG
function makeRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Constant DENSITY: world area scales with object count (no clustering).
export function makeScene(n: number, seed = 1): HasBounds[] {
  const rng = makeRng(seed);
  const world = Math.sqrt(n) * 40; // keep density constant
  const items: HasBounds[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      pos: { x: rng() * world, y: rng() * world },
      radius: 6,
    });
  }
  return items;
}

export function benchmark(n: number) {
  const scene = makeScene(n);

  // Naive: each pair once — closed form n*(n-1)/2 (no need for 200M loops when n is large).
  const naive = (n * (n - 1)) / 2;

  // Spatial hash grid
  const grid = new SpatialHashGrid<HasBounds>(24);
  for (const it of scene) grid.insert(it);
  const gridPairs = grid.queryPairs().length;

  // Quadtree
  const qt = new QuadTree<HasBounds>({
    x: 0,
    y: 0,
    w: Math.sqrt(n) * 40,
    h: Math.sqrt(n) * 40,
  });
  for (const it of scene) qt.insert(it);
  const qtPairs = qt.queryPairs().length;

  return { n, naive, gridPairs, qtPairs };
}
