import { type Vec2, vec } from "./vec";

export interface Body {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  invMass: number; // 1/mass — 0 for static bodies
  bounciness: number; // 0 = no bounce, 1 = full bounce
}

export function createBody(
  x: number,
  y: number,
  radius: number,
  opts: { static?: boolean; bounciness?: number } = {},
): Body {
  return {
    pos: vec(x, y),
    vel: vec(),
    radius,
    invMass: opts.static ? 0 : 1 / (radius * radius),
    bounciness: opts.bounciness ?? 0.6,
  };
}
