import type { Vec2 } from "./vec";

// Izgaraya girebilen her şey: bir konumu ve bir yarıçapı olsun, gerisi umurunda değil.
export interface HasBounds {
  pos: Vec2;
  radius: number;
}

export class SpatialHashGrid<T extends HasBounds> {
  private cells = new Map<string, number[]>(); // hücre anahtarı → o hücredeki cisim id'leri
  private items: T[] = []; // id (indeks) → cisim

  constructor(public readonly cellSize: number) {}

  // Her kareyi taze başlat: eski hücreleri sil.
  clear(): void {
    this.cells.clear();
    this.items.length = 0;
  }

  // Bir hücre koordinatını Map anahtarına çevir.
  private hash(cx: number, cy: number): string {
    return cx + "," + cy;
  }

  // Bir dünya koordinatını hücre koordinatına indir.
  private cellOf(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(item: T): void {
    const id = this.items.length;
    this.items.push(item);

    const minCx = this.cellOf(item.pos.x - item.radius);
    const maxCx = this.cellOf(item.pos.x + item.radius);
    const minCy = this.cellOf(item.pos.y - item.radius);
    const maxCy = this.cellOf(item.pos.y + item.radius);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.hash(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(id);
      }
    }
  }

  queryPairs(): Array<[T, T]> {
    const pairs: Array<[T, T]> = [];
    const seen = new Set<number>();
    const n = this.items.length;

    for (const cell of this.cells.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i];
          const b = cell[j];
          // Küçük id * N + büyük id → her çift için tek, çakışmasız anahtar.
          const lo = a < b ? a : b;
          const hi = a < b ? b : a;
          const key = lo * n + hi;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([this.items[lo], this.items[hi]]);
        }
      }
    }
    return pairs;
  }

  insertSwept(item: T & { vel: Vec2 }, dt: number): void {
    const nx = item.pos.x + item.vel.x * dt; // bir sonraki karedeki konum
    const ny = item.pos.y + item.vel.y * dt;

    const minX = Math.min(item.pos.x, nx) - item.radius;
    const maxX = Math.max(item.pos.x, nx) + item.radius;
    const minY = Math.min(item.pos.y, ny) - item.radius;
    const maxY = Math.max(item.pos.y, ny) + item.radius;

    const id = this.items.length;
    this.items.push(item);
    for (let cx = this.cellOf(minX); cx <= this.cellOf(maxX); cx++) {
      for (let cy = this.cellOf(minY); cy <= this.cellOf(maxY); cy++) {
        const key = this.hash(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(id);
      }
    }
  }
}
