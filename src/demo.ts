import { type Body, createBody } from "./body";
import { add, sub, scale, length, dot, normalize } from "./vec";
import { SpatialHashGrid } from "./grid";

// --- FPS counter: 500ms window ---
let frames = 0;
let fpsSince = performance.now();
let fps = 0;

function sampleFps(now: number) {
  frames++;
  if (now - fpsSince >= 500) {
    fps = Math.round((frames * 1000) / (now - fpsSince));
    frames = 0;
    fpsSince = now;
  }
}

// --- Scene ---
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = (canvas.width = window.innerWidth);
const H = (canvas.height = window.innerHeight);

const GRAVITY = 900;
const bodies: Body[] = [];
// Cell size ≈ 1-2x the diameter of the largest body (diameter 12 → 24). If chosen too large
// (e.g. 48), in dense stacks every cell contains dozens of bodies and candidate pair count explodes.
const grid = new SpatialHashGrid<Body>(16);

let useGrid = true; // false → naive O(n²)

// --- Instrumentation: where does the time go? ---
let broadMs = 0; // broad-phase (grid clear+insert+queryPairs) duration
let narrowMs = 0; // narrow-phase (collideBodies) duration
let candCount = 0; // candidate pair count sent to narrow-phase in this frame

function spawn(count: number) {
  for (let i = 0; i < count; i++) {
    const b = createBody(Math.random() * W, Math.random() * H * 0.5, 6, {
      bounciness: 0.5,
    });
    b.vel = { x: (Math.random() - 0.5) * 200, y: Math.random() * 100 };
    bodies.push(b);
  }
}

// Narrow-phase: resolve two bodies (same math as engine collideBodies).
function collideBodies(a: Body, b: Body) {
  const totalInvMass = a.invMass + b.invMass;
  if (totalInvMass === 0) return;
  const delta = sub(b.pos, a.pos);
  const dist = length(delta);
  const minDist = a.radius + b.radius;
  if (dist >= minDist || dist === 0) return;
  const normal = normalize(delta);
  const relVel = sub(b.vel, a.vel);
  const approach = dot(relVel, normal);
  if (approach > 0) return;
  const e = Math.min(a.bounciness, b.bounciness);
  const impulse = (-(1 + e) * approach) / totalInvMass;
  a.vel = sub(a.vel, scale(normal, impulse * a.invMass));
  b.vel = add(b.vel, scale(normal, impulse * b.invMass));
  const overlap = minDist - dist;
  a.pos = sub(a.pos, scale(normal, overlap * (a.invMass / totalInvMass)));
  b.pos = add(b.pos, scale(normal, overlap * (b.invMass / totalInvMass)));
}

function collideWalls(b: Body) {
  if (b.pos.x - b.radius < 0) {
    b.pos.x = b.radius;
    b.vel.x = -b.vel.x * b.bounciness;
  }
  if (b.pos.x + b.radius > W) {
    b.pos.x = W - b.radius;
    b.vel.x = -b.vel.x * b.bounciness;
  }
  if (b.pos.y - b.radius < 0) {
    b.pos.y = b.radius;
    b.vel.y = -b.vel.y * b.bounciness;
  }
  if (b.pos.y + b.radius > H) {
    b.pos.y = H - b.radius;
    b.vel.y = -b.vel.y * b.bounciness;
  }
}

function step(dt: number) {
  for (const b of bodies) {
    b.vel = add(b.vel, scale({ x: 0, y: GRAVITY }, dt));
    b.pos = add(b.pos, scale(b.vel, dt));
  }
  for (const b of bodies) collideWalls(b);

  if (useGrid) {
    // BROAD-PHASE: spatial hash grid
    const t0 = performance.now();
    grid.clear();
    for (const b of bodies) grid.insert(b);
    const pairs = grid.queryPairs();
    const t1 = performance.now();
    candCount = pairs.length;
    for (const [a, b] of pairs) collideBodies(a, b);
    broadMs = t1 - t0;
    narrowMs = performance.now() - t1;
  } else {
    // NAIVE: every pair once (O(n²))
    const t0 = performance.now();
    let c = 0;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        collideBodies(bodies[i], bodies[j]);
        c++;
      }
    }
    candCount = c;
    broadMs = 0;
    narrowMs = performance.now() - t0;
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#38bdf8";
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fbbf24";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(
    `FPS ${fps}  •  bodies ${bodies.length}  •  mode: ${useGrid ? "grid" : "naive O(n²)"}  •  cell ${grid.cellSize}`,
    14,
    26,
  );
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    `candidate pairs ${candCount.toLocaleString("en-US")}  •  broad ${broadMs.toFixed(1)}ms  •  narrow ${narrowMs.toFixed(1)}ms`,
    14,
    48,
  );
}

let last = performance.now();
function loop(now: number) {
  sampleFps(now);
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

document.getElementById("add")?.addEventListener("click", () => spawn(500));
document.getElementById("toggle")?.addEventListener("click", () => {
  useGrid = !useGrid;
});

spawn(500);
requestAnimationFrame(loop);
