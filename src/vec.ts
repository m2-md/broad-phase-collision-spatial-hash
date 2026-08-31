// Vektörler: fiziğin alfabesi. 2D dünyada her şey iki sayıdır.
export type Vec2 = { x: number; y: number };

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, s: number): Vec2 => vec(a.x * s, a.y * s);
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len === 0 ? vec() : scale(a, 1 / len);
};
