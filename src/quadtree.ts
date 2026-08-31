import type { HasBounds } from "./grid";

interface QuadBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class QuadTree<T extends HasBounds> {
  private items: T[] = [];
  private children: QuadTree<T>[] | null = null;

  constructor(
    private bounds: QuadBounds,
    private capacity = 8,
    private maxDepth = 8,
    private depth = 0,
  ) {}

  insert(item: T): void {
    if (this.children) {
      const c = this.childFor(item);
      if (c) {
        c.insert(item);
        return;
      } // tam bir çocuğa sığıyorsa oraya in
    }
    this.items.push(item);
    if (
      !this.children &&
      this.items.length > this.capacity &&
      this.depth < this.maxDepth
    ) {
      this.subdivide();
    }
  }

  // Bounds'u dörde böl, 4 çocuk oluştur, mevcut item'ları uygun çocuklara dağıt.
  private subdivide(): void {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2;
    const hh = h / 2;
    const mk = (bx: number, by: number) =>
      new QuadTree<T>(
        { x: bx, y: by, w: hw, h: hh },
        this.capacity,
        this.maxDepth,
        this.depth + 1,
      );
    this.children = [
      mk(x, y), // NW
      mk(x + hw, y), // NE
      mk(x, y + hh), // SW
      mk(x + hw, y + hh), // SE
    ];
    const kept: T[] = [];
    for (const item of this.items) {
      const c = this.childFor(item);
      if (c) c.insert(item);
      else kept.push(item); // sınırı aşanlar (straddle) üst düğümde kalır
    }
    this.items = kept;
  }

  // Item'ın AABB'si tek bir çocuğa TAMAMEN sığıyorsa o çocuğu, yoksa null döndür.
  private childFor(item: T): QuadTree<T> | null {
    if (!this.children) return null;
    const minX = item.pos.x - item.radius;
    const maxX = item.pos.x + item.radius;
    const minY = item.pos.y - item.radius;
    const maxY = item.pos.y + item.radius;
    for (const c of this.children) {
      const { x, y, w, h } = c.bounds;
      if (minX >= x && maxX <= x + w && minY >= y && maxY <= y + h) return c;
    }
    return null;
  }

  // Aday çiftler: her düğümün kendi içi + atalarındaki cisimlerle eşleşmesi.
  queryPairs(): Array<[T, T]> {
    const out: Array<[T, T]> = [];
    this.collect([], out);
    return out;
  }

  // Bu düğümün item'ları arası (i<j) çiftler + item'lar × atalar; sonra çocuklara in.
  private collect(ancestorItems: T[], out: Array<[T, T]>): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        out.push([items[i], items[j]]);
      }
      for (const anc of ancestorItems) {
        out.push([anc, items[i]]);
      }
    }
    if (this.children) {
      const passed = ancestorItems.concat(items);
      for (const c of this.children) c.collect(passed, out);
    }
  }
}
