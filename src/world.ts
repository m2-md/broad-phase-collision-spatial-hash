import { type Body } from "./body";
import { type Vec2, vec, add, sub, scale, length, dot, normalize } from "./vec";
import { SpatialHashGrid } from "./grid";

export interface ContactEvent {
  a: Body;
  b: Body;
  speed: number; // normal boyunca yaklaşma hızı (px/s)
}

type ContactListener = (e: ContactEvent) => void;

export class World {
  bodies: Body[] = [];
  grid = new SpatialHashGrid<Body>(48); // hücre ≈ en büyük çapın 1-2 katı
  gravity: Vec2;
  private listeners: ContactListener[] = [];

  constructor(
    public width: number,
    public height: number,
    gravityY = 900,
  ) {
    this.gravity = vec(0, gravityY);
  }

  add(body: Body): Body {
    this.bodies.push(body);
    return body;
  }

  remove(body: Body) {
    this.bodies = this.bodies.filter((b) => b !== body);
  }

  onContact(fn: ContactListener) {
    this.listeners.push(fn);
  }

  private emitContact(a: Body, b: Body, speed: number) {
    for (const fn of this.listeners) fn({ a, b, speed });
  }

  step(dt: number) {
    // 1. Entegrasyon (aynı)
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      b.vel = add(b.vel, scale(this.gravity, dt));
      b.pos = add(b.pos, scale(b.vel, dt));
    }

    // 2. Duvar çarpışmaları (aynı)
    for (const b of this.bodies) this.collideWalls(b);

    // 3. BROAD-PHASE: ızgarayı her kare temizle ve doldur
    this.grid.clear();
    for (const b of this.bodies) this.grid.insert(b);

    // 4. NARROW-PHASE: sadece aday çiftler için mevcut çözücü
    for (const [a, b] of this.grid.queryPairs()) {
      this.collideBodies(a, b);
    }
  }

  private collideWalls(b: Body) {
    if (b.invMass === 0) return;

    if (b.pos.x - b.radius < 0) {
      b.pos.x = b.radius;
      b.vel.x = -b.vel.x * b.bounciness;
    }
    if (b.pos.x + b.radius > this.width) {
      b.pos.x = this.width - b.radius;
      b.vel.x = -b.vel.x * b.bounciness;
    }
    if (b.pos.y - b.radius < 0) {
      b.pos.y = b.radius;
      b.vel.y = -b.vel.y * b.bounciness;
    }
    if (b.pos.y + b.radius > this.height) {
      b.pos.y = this.height - b.radius;
      b.vel.y = -b.vel.y * b.bounciness;
    }
  }

  private collideBodies(a: Body, b: Body) {
    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass === 0) return; // iki statik cisim çarpışamaz

    const delta = sub(b.pos, a.pos);
    const dist = length(delta);
    const minDist = a.radius + b.radius;
    if (dist >= minDist || dist === 0) return; // temas yok

    const normal = normalize(delta); // a'dan b'ye çarpışma yönü
    const relVel = sub(b.vel, a.vel);
    const approach = dot(relVel, normal); // normal boyunca yaklaşma hızı
    if (approach > 0) return; // zaten ayrılıyorlar

    this.emitContact(a, b, -approach);

    // Impulse: çarpışmanın "şiddetini" tek sayıya indirger
    const e = Math.min(a.bounciness, b.bounciness);
    const impulse = (-(1 + e) * approach) / totalInvMass;
    a.vel = sub(a.vel, scale(normal, impulse * a.invMass));
    b.vel = add(b.vel, scale(normal, impulse * b.invMass));

    // İç içe geçmeyi düzelt: herkes kütlesi oranında geri çekilir
    const overlap = minDist - dist;
    a.pos = sub(a.pos, scale(normal, overlap * (a.invMass / totalInvMass)));
    b.pos = add(b.pos, scale(normal, overlap * (b.invMass / totalInvMass)));
  }
}
