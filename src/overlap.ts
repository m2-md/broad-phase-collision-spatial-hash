import type { HasBounds } from "./grid";

export function circlesOverlap(a: HasBounds, b: HasBounds): boolean {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r; // karekök yok — mesafe² karşılaştırması yeter
}
