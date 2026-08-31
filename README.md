# Broad-Phase Çarpışma — Uzamsal Hash Izgarası

"Herkesle Tokalaşmak: 200 Nesneden 20.000'e Broad-Phase Çarpışma ve Uzamsal Hash
Izgarası" makalesinin çalışan kodu. Naif O(n²) çift-çift çarpışma testini, uzamsal
hash ızgarası (spatial hash grid) ile neredeyse-doğrusala indirir — narrow-phase'e
tek satır dokunmadan.

Bu proje `canvas-physics-from-scratch` motorunun üzerine kurulur: `Vec2`, `Body` ve
`collideBodies`/`collideWalls` narrow-phase mantığı oradan gelir. Tek değişen şey,
`World.step()` içindeki naif çift döngünün broad → narrow hattıyla değiştirilmesi.

## İçerik

- `src/grid.ts` — `SpatialHashGrid<T>`: AABB'nin dokunduğu tüm hücrelere ekleme,
  id-sıralı `lo*n+hi` anahtarıyla teklleştirilmiş `queryPairs()`, süpürülmüş AABB için
  `insertSwept()`.
- `src/quadtree.ts` — `QuadTree<T>`: doluluğa göre bölünen alternatif broad-phase;
  her aday çifti tam bir kez üretir (dedup gerekmez).
- `src/overlap.ts` — `circlesOverlap`: karekök içermeyen mesafe² testi.
- `src/benchmark.ts` — deterministik sahne üretimi (mulberry32) + naif/grid/quadtree
  aday sayısı karşılaştırması + hücre boyutu taraması.
- `src/world.ts` — motorun `step()`'i broad → narrow hattıyla.
- `src/demo.ts` + `index.html` — canlı canvas demosu.

## Kurulum

```bash
npm install
```

## Çalıştırma

> ⚠️ **`index.html`'i çift tıklayıp doğrudan açma.** Demo bir TypeScript modülü
> (`<script type="module" src="/src/demo.ts">`) yükler; tarayıcı `.ts` dosyasını tek
> başına çalıştıramaz. `file://` ile açarsan boş ekran görürsün. Aşağıdaki `npm run dev`
> (Vite) komutu TypeScript'i tarayıcıya derleyip sunar — çalıştırmanın **tek** yolu budur.

### Canlı demo (FPS uçurumu)

```bash
npm install   # bir kez
npm run dev
```

`http://localhost:5173/` açılır. Sağ üstteki düğmeler:

- **+500 cisim** — her basışta 500 daire ekler.
- **naif / grid geçişi** — broad-phase'i naif O(n²) ile ızgara arasında değiştirir.

Sol üstte HUD: anlık FPS, cisim sayısı, aktif mod, hücre boyutu ve **zamanın nereye
gittiği** — o karede narrow-phase'e giden `aday çift` sayısı + `broad` (ızgara kurma/sorgu)
ve `narrow` (çarpışma çözme) süreleri ayrı ayrı.

Naif moda geçince birkaç yüz cisimde FPS uçurumdan atlar — O(n²) budur. Grid modu binlerce
cismi rahat taşır; ama unutma: broad-phase aday *üretimini* ucuzlatır, temasları çözmeyi
değil. Cisimler dibe **yoğun** yığılınca aday çift sayısı gerçek komşu sayısına bağlı olarak
kabarır ve grid modu da yavaşlar. İki kaldıraç var: (1) **hücre boyutu** — çapın ~1–2 katı
tut; çok büyük seçersen (bu demoda 48 yerine 16, radius-6 cisimler için) her hücreye onlarca
cisim düşer ve aday sayısı patlar; (2) sıcak döngüdeki **ayırmalar** (her karede yeni `Vec2`
ve çift dizileri) — bu, nesne havuzu yazısının konusu.

### Testler

```bash
npm test
```

4 test, broad-phase'in **hiçbir gerçek çarpışmayı kaçırmadığını** kanıtlar:

1. Izgaranın süzülmüş adayları, brute-force O(n²) çakışma kümesiyle birebir eşit.
2. Aynı çift iki kez üretilmez (çift sayım yok).
3. Çok hücreye taşan büyük cisim, üç küçük komşusunun üçüyle de eşleşir.
4. Aynı parite kontrolü `QuadTree.queryPairs()` için de geçer.

### Benchmark

```bash
npm run bench
```

`benchmark(200)`, `benchmark(2000)`, `benchmark(20000)` çalıştırıp üretilen aday çift
sayılarını basar (narrow-phase'in kaç kez çağrılacağı — deterministik metrik).

Beklenen çıktı (sabit yoğunluk, `seed = 1`, `cellSize = 24`):

```
       n    naive n(n-1)/2    grid (cell=24)      quadtree
----------------------------------------------------------
     200            19,900               160         4,451
   2,000         1,999,000             1,418       163,493
  20,000       199,990,000            14,323     4,818,747
```

Naif sütun karesel tırmanır (`n(n-1)/2`); ızgara neredeyse doğrusal ve 20.000 nesnede
naif'ten ~14.000 kat az aday üretir. Quadtree naife göre uçuruma köprü kurar ama bu
düzgün dağılmış sahnede ızgaranın gerisinde kalır — quadtree, kümelenmiş ve boyutça
değişken sahnelerde öne geçer.

## Dosya yapısı

```
src/
  vec.ts        # Vec2 yardımcıları (motordan kopya)
  body.ts       # Body + createBody (motordan kopya)
  world.ts      # World.step: entegrasyon → duvarlar → BROAD → NARROW
  grid.ts       # SpatialHashGrid<T>
  quadtree.ts   # QuadTree<T>
  overlap.ts    # circlesOverlap (mesafe² testi)
  benchmark.ts  # makeScene / benchmark / sweepCellSize / countNaiveChecks
  bench-cli.ts  # bench tablosunu stdout'a basar
  demo.ts       # canlı canvas demosu
test/
  grid.test.ts  # brute-force parity + çift sayım + büyük cisim + quadtree parity
index.html      # demo giriş noktası
```

## Lisans

MIT
