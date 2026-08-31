import { SpatialHashGrid, type HasBounds } from "./grid";
import { QuadTree } from "./quadtree";

export function countNaiveChecks(n: number): number {
  let checks = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      checks++; // burada gerçek collideBodies çağrılırdı
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

// mulberry32: küçük, hızlı, deterministik PRNG
function makeRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sabit YOĞUNLUK: dünya alanı nesne sayısıyla büyür (kümelenme yok).
export function makeScene(n: number, seed = 1): HasBounds[] {
  const rng = makeRng(seed);
  const world = Math.sqrt(n) * 40; // yoğunluğu sabit tut
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

  // Naif: her çift bir kez — kapalı form n(n-1)/2 (n büyükken 200M döngüye gerek yok).
  const naive = (n * (n - 1)) / 2;

  // Izgara
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
