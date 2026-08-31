import { describe, it, expect } from "vitest";
import { SpatialHashGrid, type HasBounds } from "../src/grid";
import { QuadTree } from "../src/quadtree";
import { circlesOverlap } from "../src/overlap";

interface TestItem extends HasBounds {
  id: number;
}

function scene(n: number, seed: number): TestItem[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: n }, (_, id) => ({
    id,
    pos: { x: rand() * 400, y: rand() * 400 },
    radius: 6 + rand() * 10, // farklı boyutlar: AABB'nin çok hücreliliğini zorla
  }));
}

// Brute-force: gerçekten çakışan tüm çiftler (referans doğru)
function bruteForceOverlaps(items: TestItem[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (circlesOverlap(items[i], items[j])) set.add(`${i}-${j}`);
    }
  }
  return set;
}

describe("SpatialHashGrid.queryPairs", () => {
  it("gerçekten çakışan hiçbir çifti kaçırmaz (brute-force ile birebir)", () => {
    const items = scene(500, 42);
    const grid = new SpatialHashGrid<TestItem>(24);
    for (const it of items) grid.insert(it);

    const fromGrid = new Set<string>();
    for (const [a, b] of grid.queryPairs()) {
      if (circlesOverlap(a, b)) {
        const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        fromGrid.add(`${lo}-${hi}`);
      }
    }

    expect(fromGrid).toEqual(bruteForceOverlaps(items));
  });

  it("aynı çifti iki kez üretmez (çift sayım yok)", () => {
    const items = scene(300, 7);
    const grid = new SpatialHashGrid<TestItem>(20);
    for (const it of items) grid.insert(it);

    const pairs = grid.queryPairs();
    const keys = pairs.map(([a, b]) =>
      a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`,
    );
    expect(new Set(keys).size).toBe(keys.length); // hepsi benzersiz
  });

  it("çok hücreye taşan büyük cismi tüm komşularıyla eşleştirir", () => {
    const big: TestItem = { id: 0, pos: { x: 100, y: 100 }, radius: 60 };
    const small: TestItem[] = [
      { id: 1, pos: { x: 60, y: 100 }, radius: 5 },
      { id: 2, pos: { x: 140, y: 100 }, radius: 5 },
      { id: 3, pos: { x: 100, y: 55 }, radius: 5 },
    ];
    const grid = new SpatialHashGrid<TestItem>(24); // hücre << büyük çap
    for (const it of [big, ...small]) grid.insert(it);

    const hits = new Set<number>();
    for (const [a, b] of grid.queryPairs()) {
      if (circlesOverlap(a, b)) {
        if (a.id === 0) hits.add(b.id);
        if (b.id === 0) hits.add(a.id);
      }
    }
    expect(hits).toEqual(new Set([1, 2, 3])); // üçünü de yakaladı
  });
});

describe("QuadTree.queryPairs", () => {
  it("gerçekten çakışan hiçbir çifti kaçırmaz (brute-force ile birebir)", () => {
    const items = scene(500, 42);
    const qt = new QuadTree<TestItem>({ x: 0, y: 0, w: 400, h: 400 });
    for (const it of items) qt.insert(it);

    const fromTree = new Set<string>();
    for (const [a, b] of qt.queryPairs()) {
      if (circlesOverlap(a, b)) {
        const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        fromTree.add(`${lo}-${hi}`);
      }
    }

    expect(fromTree).toEqual(bruteForceOverlaps(items));
  });
});
