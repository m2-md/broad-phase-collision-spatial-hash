import { benchmark } from "./benchmark";

// Aday çift sayıları: narrow-phase'in kaç kez çağrılacağı. Deterministik metrik.
const rows = [200, 2000, 20000].map((n) => benchmark(n));

const fmt = (x: number) => x.toLocaleString("en-US");
const pad = (s: string, w: number) => s.padStart(w);

console.log("Broad-phase aday çift sayıları (sabit yoğunluk, seed=1)\n");
console.log(
  pad("n", 8) +
    pad("naive n(n-1)/2", 18) +
    pad("grid (cell=24)", 18) +
    pad("quadtree", 14),
);
console.log("-".repeat(58));
for (const r of rows) {
  console.log(
    pad(fmt(r.n), 8) +
      pad(fmt(r.naive), 18) +
      pad(fmt(r.gridPairs), 18) +
      pad(fmt(r.qtPairs), 14),
  );
}

console.log("");
for (const r of rows) {
  const ratio = Math.round(r.naive / r.gridPairs);
  console.log(
    `n=${fmt(r.n)}: grid, naif'ten ~${fmt(ratio)}x az aday üretiyor.`,
  );
}
