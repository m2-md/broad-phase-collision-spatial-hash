
# Herkesle Tokalaşmak: 200 Nesneden 20.000'e Broad-Phase Çarpışma ve Uzamsal Hash Izgarası

*Kendi fizik motorumuzdaki O(n²) çift-çift çarpışma testini, 20.000 nesnede bile 60 FPS koruyan bir spatial hash grid ile neredeyse-doğrusala indiriyoruz — narrow-phase'e tek satır dokunmadan.*

*Tahmini okuma süresi: 15 dakika*

---

Fizik motorumuz bitmişti, oyun çalışıyordu, ben de keyifle sapanı çekip taşları kırıyordum. Sonra hep olan oldu: merak. "Peki bu sahnede yirmi cisim yerine iki yüz cisim olsa ne olur?"

İki yüz topu ekrana döktüm. FPS 60'tan 22'ye düştü.

Bin top ekledim. Sayfa donma noktasına geldi, fan devreye girdi, laptopum kalkışa hazırlanan bir uçak gibi ötmeye başladı. Oysa çizim tarafı gayet rahattı — bin daire çizmek tarayıcı için çocuk oyuncağı. Sorun çizimde değildi. Sorun, her karede yaptığımız o masum görünen çift döngüdeydi.

Daha önce sıfırdan bir fizik motoru yazmıştık; orada çarpışmaları en kaba yöntemle, her cismi diğer her cisimle tek tek karşılaştırarak çözmüştük. O yazıda dürüstçe "bunun ölçeklenmediğini, üretimde Matter.js'in bu işi hallettiğini" söyleyip broad-phase optimizasyonunu ona havale etmiştik. Bugün o borcu kapatıyoruz. Broad-phase'i (geniş faz) kendimiz yazacağız ve motorumuzu 200 nesneden 20.000 nesneye çıkaracağız — hem de Matter.js'e hiç ihtiyaç duymadan.

Bunu bir düğün salonu gibi düşünün. Motorumuzun şu anki hali, salondaki herkesin diğer herkesle *tek tek* tokalaşmakta ısrar ettiği bir davet gibi. Yirmi kişilik masada eğlenceli; iki bin kişilik salonda felaket. Bu yazının tamamı tek bir fikrin peşinde: insanları salonun her yerinde koşuşturmak yerine masalara oturt, herkes sadece kendi masasındakilerle — ve olsa olsa yan masayla — tokalaşsın. İşin sırrı bu.

### O(n²) Duvarı

Önce derdi ölçelim, çünkü "yavaş" bir his değil, bir sayıdır. Motorumuzun `step()` fonksiyonu şu üç satırla bitiyordu:

```ts
// ÖNCE — fizik motorunun eski hali; bu projede YOK, sökülen naif döngü
// 3. Cisim-cisim çarpışmaları (her çift bir kez)
for (let i = 0; i < this.bodies.length; i++) {
  for (let j = i + 1; j < this.bodies.length; j++) {
    this.collideBodies(this.bodies[i], this.bodies[j]);
  }
}
```

Zararsız görünüyor. Ama bu iç içe döngü, `n` cisim için tam olarak `n × (n − 1) / 2` çift üretir. Bu bizim tokalaşma sayımız: salondaki herkes diğer herkesin elini bir kez sıksın.

Sayılar acımasız. 200 cisimde 19.900 kontrol — idare eder. 2.000 cisimde 1.999.000 kontrol. 20.000 cisimde ise 199.990.000 kontrol. Cismi 100 katına çıkardık, iş yükü 10.000 katına çıktı. Karesel büyümenin (quadratic growth) tuzağı tam olarak budur: nesne sayısı doğrusal artar, maliyet ivmelenerek. Broad-phase dediğimiz bütün optimizasyon da bu duvarı aşmak için var.

Bunu bir grafiğe dökmek için karmaşık bir profil aracına gerek yok. Yaptığımız kontrol sayısını doğrudan sayabiliriz — bu sayı deterministiktir, makineden makineye değişmez:

```ts
// src/benchmark.ts
export function countNaiveChecks(n: number): number {
  let checks = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      checks++; // burada gerçek collideBodies çağrılırdı
    }
  }
  return checks;
}
```

Tarayıcıda bunu canlı hissetmek istersek, saniyede kaç kare çizdiğimizi ölçen küçük bir sayaç yeterli. Bir HUD kütüphanesine gerek yok:

```ts
// src/demo.ts
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
```

Sahneye "+500 cisim" düğmesi koyup FPS'in her basışta nasıl eridiğini izlemek, bu yazının en ikna edici anı. Grafik yavaşça düşmez; bir eşikten sonra uçurumdan atlar. O uçurum, O(n²)'nin ta kendisi.

### Broad Phase mi, Narrow Phase mi?

Şimdi kritik zihinsel geçişi yapalım. Motorumuzdaki `collideBodies` fonksiyonuna bir daha bakın:

```ts
// src/world.ts — KISALTILMIŞ alıntı: gövdenin tamamı için dosyaya bakın
private collideBodies(a: Body, b: Body) {
  const delta = sub(b.pos, a.pos);
  const dist = length(delta);
  const minDist = a.radius + b.radius;
  if (dist >= minDist || dist === 0) return; // temas yok
  // ... normal, impulse, overlap düzeltmesi ...
}
```

Bu fonksiyon iki cismin *gerçekten* çarpışıp çarpışmadığını mesafe testiyle kesin olarak söyler, sonra impulse ile çözer. Kesin, doğru, hassas. Ve pahalı — çünkü karekök, vektör çıkarma, iç çarpım içerir.

Bu fonksiyonun bir adı var: **narrow-phase** (dar faz). "Dar" çünkü tek bir aday çifte odaklanır ve o çiftin kaderini tam hassasiyetle belirler. Onu yazarken farkında değildik ama bütün fizik motorlarının çarpışma hattı iki kademeye ayrılır:

- **Broad-phase (geniş faz):** Ucuz ve kaba. "Bu iki cisim *belki* çarpışıyor olabilir mi?" sorusunu bir avuç toplama-çıkarma ile yanıtlar. Milyonlarca imkânsız çifti bir çırpıda eler, geriye bir avuç aday çift (candidate pairs) bırakır. Asla "kesin çarpıştı" demez; sadece "bunlara bir bakmaya değer" der.
- **Narrow-phase (dar faz):** Pahalı ve kesin. Sadece broad-phase'in seçtiği aday çiftler üzerinde çalışır, gerçek geometriyi test eder ve çarpışmayı çözer. Bizim `collideBodies`'imiz tam olarak budur.

Motorumuzun tek suçu, broad-phase'i hiç yazmamış olmaktı. O naif çift döngü, "aday eleme" adımını atlayıp *her* çifti doğrudan pahalı narrow-phase'e sokuyordu. Salondaki herkesi zorla tokalaştırıyorduk.

Hedef pipeline şu kadar basit:

```
her kare:
  1. entegrasyon (yerçekimi → hız → konum)      ← değişmedi
  2. duvar çarpışmaları                          ← değişmedi
  3. BROAD-PHASE  → aday çiftleri üret            ← YENİ
  4. NARROW-PHASE → her aday çift için collideBodies  ← aynı fonksiyon, daha az çağrı
```

Dikkat edin: narrow-phase'e tek satır dokunmuyoruz. `collideBodies` neyse o kalıyor. Tek yaptığımız, onun önüne bir kapıcı dikmek — ve o kapıcının adı uzamsal hash ızgarası.

### Uniform Bir Uzamsal Hash Izgarası

Kapıcının işi şu: dünyayı eşit kareli hücrelere böl, her cismi ait olduğu hücre(ler)e yerleştir, sonra sadece *aynı hücreyi paylaşan* cisimleri aday çift olarak öner. Salonu masalara böldük; artık sadece masa arkadaşlarınla tokalaşıyorsun.

Bu yapının adı **spatial hash grid** (uzamsal hash ızgarası). "Hash" kısmı şuradan geliyor: bir cismin dünya koordinatını `(x, y)` alıp, hangi hücreye düştüğünü söyleyen bir hücre anahtarına indiriyoruz. Anahtar, o hücreye ait cisimlerin listesini tutan bir `Map`'in kapısı.

Önce ızgaranın gördüğü minimal nesneyi tanımlayalım. Izgaranın bir cismin fiziğini, hızını, kütlesini bilmesine gerek yok — sadece *nerede* ve *ne kadar geniş* olduğunu bilmesi yeter:

```ts
// src/grid.ts
import type { Vec2 } from "./vec";

// Izgaraya girebilen her şey: bir konumu ve bir yarıçapı olsun, gerisi umurunda değil.
export interface HasBounds {
  pos: Vec2;
  radius: number;
}
```

`Body` tipimiz bunu zaten sağlıyor (`pos` ve `radius` alanları var), o yüzden ızgara motorumuzla doğrudan konuşabilecek. Şimdi sınıfın kendisi:

```ts
// src/grid.ts — sınıfın iskeleti; insert/queryPairs birazdan ekleniyor
export class SpatialHashGrid<T extends HasBounds> {
  private cells = new Map<string, number[]>(); // hücre anahtarı → o hücredeki cisim id'leri
  private items: T[] = [];                      // id (indeks) → cisim

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
}
```

Anahtar olarak `"3,-2"` gibi bir string kullandım. Bir dakika sonra bunu tartışacağız — evet, string anahtar bir performans yazısında biraz ironik duruyor. Ama önce doğru, sonra hızlı.

Bir şeyi baştan söyleyeyim: `hash` fonksiyonu iki hücre koordinatını *çakışmasız* bir anahtara çevirmeli. Klasik uzamsal hash örneklerinde `cx * asal1 ^ cy * asal2` gibi bir XOR haşi görürsünüz. O yaklaşımın gizli bir tuzağı var: iki farklı hücre aynı sayıya haşlenebilir ve o an iki ayrı masa tek masaya karışır — hayalet aday çiftler doğar. String anahtar bu riski tümden ortadan kaldırır, negatif koordinatları da dertsizce taşır. Sabit faktörü biraz yükseltir; karesel duvarın yanında bu bir kum tanesi.

### Ekleme, Sorgu ve Hücre Boyutu

Sıra ekleme (insertion) ve sorguda (query). Ekleme adımında dikkat edilecek bir incelik var: bir cismi sadece merkezinin düştüğü hücreye koyarsak, iki hücrenin sınırında oturan iki daire çakışıyor olmasına rağmen farklı masalara düşer ve birbirini hiç görmez. Kaçırılan çarpışma, en sinsi buglardandır — çoğu zaman fark etmezsiniz, ta ki bir cisim duvarın köşesinden sızana kadar.

Çözüm temiz: cismi, sınırlayıcı kutusunun (AABB — axis-aligned bounding box, eksen-hizalı sınırlayıcı kutu) *dokunduğu her hücreye* ekle. Küçük bir daire çoğunlukla tek hücreye düşer; sınıra oturan bir daire iki-dört hücreye birden yazılır ve komşusuyla kesin buluşur:

```ts
// src/grid.ts — SpatialHashGrid gövdesi
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
```

Sorgu tarafında ise her hücrenin içindeki cisimleri ikişerli eşleştiriyoruz. Ama AABB ile birden fazla hücreye yazmanın bir bedeli var: aynı çift, iki hücreyi birden paylaşıyorsa iki kez üretilir. Bu **çift sayım** (double counting) tuzağıdır ve narrow-phase'i boşuna iki kez çalıştırır. Çözüm, id-sıralı tek bir anahtarla teklleştirme (deduplication):

```ts
// src/grid.ts — SpatialHashGrid gövdesi
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
```

`lo * n + hi` numarası, iki id'yi tek bir tam sayıya sıkıştırıyor. `n` toplam cisim sayısı olduğu için bu anahtar çakışmasız: her sıralı çift kendine özgü bir sayı üretir. `seen` seti aynı çifti ikinci kez gördüğünde susuyor. Küçük numara, temiz sonuç.

Şimdi tüm sistemin kaderini belirleyen tek parametreye geldik: **hücre boyutu** (cell size). Bunu ilk yazdığımda hücreleri kocaman tutmuştum — dünya bir tek dev hücreymiş gibi. Grid'i ekledim, çalıştırdım, FPS zerre kadar artmadı. Yarım saat "neden hızlanmadı bu?" diye baktım. Sebep aptalca basitti: tek büyük hücre demek, herkesi yine tek masaya oturtmak demek. Hücre çok büyükse ızgara naif çift döngünün pahalı bir taklidine dönüşür. Çok küçükse de her cisim onlarca hücreye yayılır, ekleme maliyeti patlar.

Tatlı nokta genellikle şurada: **hücre boyutu ≈ en büyük cismin çapının 1–2 katı.** Bu oranda her cisim bir avuç hücreye düşer, her hücrede bir avuç cisim durur. İnanmak yerine ölçelim — hücre boyutunu tarayıp (sweep) üretilen aday çift sayısını sayan küçük bir deney:

```ts
// src/benchmark.ts
export function sweepCellSize(items: HasBounds[], sizes: number[]) {
  return sizes.map((cellSize) => {
    const grid = new SpatialHashGrid<HasBounds>(cellSize);
    for (const it of items) grid.insert(it);
    const candidates = grid.queryPairs().length;
    return { cellSize, candidates };
  });
}
```

Tipik bir sahnede bu deneyin çıktısı bir U harfi çizer: çok küçük ve çok büyük hücrelerde aday sayısı yükselir, ortada bir yerde dibe vurur. O dip, sizin sahneniz için doğru hücre boyutudur. Formülle değil, ölçerek bulunur.

### Büyük ve Hızlı Nesneler

Uniform ızgaranın en bilinen zaafı: tek bir dev cisim. Salonda üç masaya birden yayılan, kolları her yere uzanan iri bir misafir düşünün. AABB'siyle ekleme yaptığımız için o dev, kapsadığı *her* hücreye yazılır — bu iyi haber, kimseyi kaçırmaz. Kötü haber: hücrelerin yarısında görünürse, karşılaştırma sayısı da o oranda artar. Uniform grid, boyları birbirine yakın cisimlerde parlar; bir karınca ile bir file aynı sahnede varsa hücre boyutunu ikisine de uyduramazsınız.

Küçük ölçekte bunu görmezden gelebilirsiniz. Ama karınca ile fil aynı sahnedeyse, yoğunluk her yerde bambaşkaysa, tek beden hücre boyutu artık kimseyi mutlu etmez; işte tam bu noktada quadtree devreye girer. Ona birazdan geliyoruz.

Bir de hızlı cisim meselesi var. Merminiz tek karede yarım ekran gidiyorsa, `insert` onu yalnızca *şu anki* konumunun hücrelerine yazar — oysa geçtiği koridordaki cisimleri hiç görmez. Broad-phase burada tünellemeyi (tunneling) *çözmez*, ama en azından doğru adayları gündeme getirebilir: cismi mevcut konumu ile bir sonraki konumu arasındaki süpürülmüş kutuya (swept AABB) göre ekleyin.

```ts
// src/grid.ts — SpatialHashGrid gövdesi
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
```

`Body`'de zaten `vel` var, o yüzden bu doğrudan çalışır. Ama dürüst olalım: bu, cismi doğru adaylarla *buluşturur*, çarpışmayı gerçekten çözmez. Merminin duvarın içinden ışınlanmasını engellemek narrow-phase'in işi — sürekli çarpışma tespiti (continuous collision detection, CCD) ve süpürülmüş AABB testleri. O ayrı bir yazının konusu; burada broad-phase'in sınırını bilmek yeter: aday üretir, karar vermez.

### Motora Takmak: Broad → Narrow

Teori tamam. Motorumuzun `step()` fonksiyonunda o naif çift döngüyü söküp yerine iki kademeli hattı koyalım. Dünyaya bir ızgara alanı ekliyoruz ve son bloğu değiştiriyoruz:

```ts
// src/world.ts — ilgili kısım (gravity alanı, constructor ve collideWalls dosyada)
export class World {
  bodies: Body[] = [];
  grid = new SpatialHashGrid<Body>(48); // hücre ≈ en büyük çapın 1-2 katı

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
}
```

Bakın narrow-phase'e ne yaptık: hiçbir şey. `collideBodies` fizik yazısındaki haliyle, tek satırı değişmeden duruyor. Sadece ona giden çift sayısını milyonlardan binlere indirdik. Broad-phase'in bütün marifeti, pahalı fonksiyonu daha az çağırmasında. O kadar.

Bir noktaya dikkat: ızgarayı her kare `clear()` edip yeniden dolduruyoruz. "Cisimleri hücreler arasında taşımak yerine güncellesek daha hızlı olmaz mı?" diye düşünebilirsiniz — mantıklı, ama çoğu 2B oyun için baştan kurmak hem daha basit hem yeterince hızlı, çünkü ekleme zaten ucuz. Erken optimizasyon yapmadan önce ölçün; belki de hiç gerekmez.

### Benchmark — Izgara, Quadtree ve Naif

Şimdi üç yaklaşımı aynı terazide tartalım. Adil bir ölçüm için sahneyi deterministik üretmemiz lazım — tohumlu (seeded) bir rastgele sayı üreteciyle, ki herkeste ve her çalıştırmada aynı sahne çıksın:

```ts
// src/benchmark.ts
// mulberry32: küçük, hızlı, deterministik PRNG
function makeRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sabit YOĞUNLUK: dünya alanı nesne sayısıyla büyür (kümelenme yok).
export function makeScene(n: number, seed = 1): HasBounds[] {
  const rng = makeRng(seed);
  const world = Math.sqrt(n) * 40; // yoğunluğu sabit tut
  const items: HasBounds[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      pos: { x: rng() * world, y: rng() * world },
      radius: 6,
    });
  }
  return items;
}
```

`world` boyutunu `sqrt(n)` ile büyütmemiz kasıtlı: yoğunluğu sabit tutuyoruz. Bu önemli, çünkü uzamsal ızgaranın "neredeyse-doğrusal" vaadi tam da bu koşulda geçerli. Her şeyi tek noktaya yığarsanız ızgara da O(n²)'ye geri döner — bu bir kusur değil, doğanın vergisi. Kümelenme senaryosunda quadtree daha iyi savaşır.

Harness her yöntemin ürettiği aday çift sayısını sayar (bu deterministik, makineden bağımsız bir metriktir) ve süreyi ölçer:

```ts
// src/benchmark.ts
export function benchmark(n: number) {
  const scene = makeScene(n);

  // Naif: her çift bir kez — kapalı form n(n-1)/2 (n büyükken 200M döngüye gerek yok).
  const naive = (n * (n - 1)) / 2;

  // Izgara
  const grid = new SpatialHashGrid<HasBounds>(24);
  for (const it of scene) grid.insert(it);
  const gridPairs = grid.queryPairs().length;

  // Quadtree
  const qt = new QuadTree<HasBounds>({ x: 0, y: 0, w: Math.sqrt(n) * 40, h: Math.sqrt(n) * 40 });
  for (const it of scene) qt.insert(it);
  const qtPairs = qt.queryPairs().length;

  return { n, naive, gridPairs, qtPairs };
}
```

Bende bir çalıştırmanın ürettiği aday çift sayıları (narrow-phase'in kaç kez çağrılacağı) şöyle bir tablo çıkardı:

| Nesne (n) | Naif çift kontrolü | Izgara adayları | Quadtree adayları |
|---|---|---|---|
| 200 | 19.900 | 160 | 4.451 |
| 2.000 | 1.999.000 | 1.418 | 163.493 |
| 20.000 | 199.990.000 | 14.323 | 4.818.747 |

(Izgara `cellSize = 24`, sahne sabit yoğunlukta, `seed = 1` — sayılar deterministik, `npm run bench` ile birebir yeniden üretilir.)

Naif sütun karesel tırmanır. Izgara neredeyse doğrusal kalıyor: 20.000 nesnede naif yaklaşık 200 milyon kontrol yaparken ızgara ~14 bin ile yetiniyor — neredeyse 14.000 kat az iş. Quadtree de naife göre uçuruma köprü kuruyor (200 milyon yerine ~4,8 milyon, ~40 kat az), ama bu düzgün dağılmış sahnede ızgaranın kat kat gerisinde kalıyor — çünkü hücre sınırlarına oturan cisimler üst düğümlerde takılıp altlarındaki herkesle eşleşiyor. Bu bir sürpriz değil, tam da beklenen sonuç: uniform ve dağınık sahnede ızgara kazanır. FPS grafiğindeki o uçurum, ızgara sütununda düzlüğe dönüşüyor. İşte 60 FPS'i geri veren şey bu.

Peki quadtree'nin (dörtlü ağaç) kendisi ne? Kısaca: dünyayı sabit hücrelere bölmek yerine, *doluluğa göre* böler. Bir bölge kalabalıklaşınca dörde ayrılır, boş kalınca ayrılmaz. Uniform ızgaranın "tek beden hücre" derdine tam da bu esneklikle cevap verir — karınca ve filin bir arada olduğu, yoğunluğun her yerde farklı olduğu sahnelerde parlar. Benchmark'ımızda çalışan gerçek bir quadtree var; iskeleti şöyle:

```ts
// src/quadtree.ts — iskelet: subdivide/childFor/collect tam gövdesi dosyada
interface QuadBounds { x: number; y: number; w: number; h: number; }

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

  // Aday çiftler: her düğümün kendi içi + atalarındaki cisimlerle eşleşmesi.
  queryPairs(): Array<[T, T]> {
    const out: Array<[T, T]> = [];
    this.collect([], out);
    return out;
  }
}
```

Detayı burada açmıyorum — quadtree tek başına bir yazıyı hak ediyor (bu serinin ilerleyen bölümlerinde ona ayrı bir bölüm ayıracağım). Şimdilik önemli olan şu karşılaştırma: uniform ızgara, cisimler benzer boyda ve dağınıksa hem daha hızlı hem daha basittir; quadtree ise kümelenmiş, boyutça çok değişken sahnelerde öne geçer. Quadtree mi, uzamsal hash mi? Bu tartışmanın tek doğru cevabı yok — sahnenizin şekli cevabı belirler. İkisini de yazıp kendi sahnenizde ölçmek, blog tartışmalarını okumaktan daha hızlı yol gösterir.

> **Sonradan düşülen not.** O ayrı bölümü yazarken buradaki quadtree'de bir eksik buldum: `collect()`, ata listesini alt düğümlere *budamadan* devrediyor. Sonuç olarak üst düğümlerde takılı kalan iri cisimler, altlarındaki bütün ağaçla eşleşiyor ve yukarıdaki tablodaki quadtree sütunu olduğundan çok daha kötü çıkıyor. Çocuğun sınırlarına değmeyen atayı elemek (tek satırlık bir `aabbHitsBounds` kontrolü) aynı sahnede aday sayısını 4.818.747'den 155.240'a indiriyor — üstelik kayıpsız, çünkü `childFor` zaten tam kapsama istiyor. Buradaki tabloyu olduğu gibi bırakıyorum, çünkü yukarıdaki kodun dürüst ölçümü bu; ama quadtree'yi bu tabloya bakıp gömmeyin. Düzeltmenin tamamı ve iki sahne tipinde yeniden ölçümü quadtree yazısında.

### Testler: Izgara Yalan Söylemiyor mu?

Broad-phase'in tek ölümcül günahı var: gerçek bir çarpışmayı *kaçırmak*. Fazladan aday üretmesi affedilir — narrow-phase onları eler, sadece biraz iş kaybederiz. Ama ızgara çakışan iki cismi hiç aday göstermezse, o çarpışma sessizce yok olur; cisim duvardan geçer, oyuncu "bug" diye bağırır.

O yüzden test edilecek asıl şey şu: **ızgaranın ürettiği adaylar, gerçekten çakışan her çifti kapsamalı.** Bunu kanıtlamanın en temiz yolu, ızgara sonucunu brute-force O(n²) ile karşılaştırmak. İki daire çakışıyor mu — saf, deterministik bir fonksiyon:

```ts
// src/overlap.ts
export function circlesOverlap(a: HasBounds, b: HasBounds): boolean {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r; // karekök yok — mesafe² karşılaştırması yeter
}
```

Testli item'lara bir `id` verip, ızgaranın adaylarını gerçek çakışmaya göre süzüyoruz ve brute-force ile bire bir aynı çıkmasını bekliyoruz:

```ts
// test/grid.test.ts — SpatialHashGrid bölümü
// (dosyada ayrıca bir QuadTree parity testi var: toplam 4 test)
import { describe, it, expect } from "vitest";
import { SpatialHashGrid, type HasBounds } from "../src/grid";
import { circlesOverlap } from "../src/overlap";

interface TestItem extends HasBounds { id: number; }

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
```

İlk test kalbin ta kendisi: farklı boyutlarda 500 cisim, hepsi rastgele ama tohumlu, yani her çalıştırmada aynı. Izgaranın süzülmüş adayları, brute-force'un bulduğu çakışma kümesiyle *tam olarak* eşit çıkmalı. Bir tek çift bile eksikse test kırmızı yanar. `radius`'u bilerek dalgalandırdım ki cisimler AABB üzerinden birden çok hücreye taşsın ve çift sayım/kaçırma yolları gerçekten test edilsin.

Bu test yeşilse, broad-phase'iniz güvenilir. Milyonlarca çifti eleyen kapıcının, elemesi gerekmeyen bir tekini bile elemediğini kanıtladınız. Fizik motorunda bundan daha rahatlatıcı bir yeşil azdır.

### Özetle:

1. Naif çift-çift çarpışma testi O(n²)'dir: nesneyi 100 katına çıkarınca iş 10.000 katına çıkar. Bu bir his değil, `n(n−1)/2` formülüdür.
2. Çarpışma hattı iki kademedir: ucuz ve kaba **broad-phase** aday çiftleri eler, pahalı ve kesin **narrow-phase** onları çözer. Fizik motorumuzdaki `collideBodies` en baştan narrow-phase'di.
3. Uzamsal hash ızgarası dünyayı eşit hücrelere böler, cisimleri hücre anahtarlarına haşler, sadece aynı hücreyi paylaşanları aday gösterir. Salonu masalara böl, sadece masandakiyle tokalaş.
4. Cismi AABB'sinin dokunduğu *tüm* hücrelere ekle (sınırdaki çarpışmaları kaçırmamak için); aday çiftleri id-sıralı anahtarla teklleştir (çift sayımı önlemek için).
5. Hücre boyutu ≈ en büyük çapın 1–2 katı; çok büyükse ızgara naife döner, çok küçükse ekleme patlar. Tahmin etme, tara ve ölç.
6. Uniform ızgara benzer boyutlu, dağınık sahnelerde parlar; kümelenmiş veya boyutça çok değişken sahnelerde quadtree öne geçer. Kazananı sahnenin şekli belirler.
7. Broad-phase'in tek ölümcül günahı çarpışma kaçırmaktır. Testin: süzülmüş adaylar, brute-force çakışma kümesiyle birebir aynı olmalı.

Kodun tamamı — ızgara, quadtree, benchmark harness'i, canlı FPS demosu ve testler — GitHub'da; README'deki komutlarla `npm test` diyip testleri yeşile boyayabilir, `npm run dev` diyip FPS uçurumunu kendi gözünüzle izleyebilirsiniz.

Bu yazıyı yazarken tekrar fark ettiğim şey şu oldu: fizik motorunu ilk yazdığımızda broad-phase'i "üretim işi, Matter.js halleder" diye kenara koymuştuk. Meğer koca optimizasyon, seksen satırlık bir `Map` ve bir teklleştirme numarasından ibaretmiş. Perdeyi araladıkça hep aynı şey çıkıyor karşımıza: "zor" dediğimiz çoğu şey, kutusu içinden büyük.

Salonu masalara böldük. Artık yirmi bin misafir aynı anda dans edebilir — ve kimse yanlış kişiyle tokalaşmıyor. ⚙️🧠

---

### 🚀 Serinin ve Konunun Devamı
Web oyun motoru ve fizik optimizasyon serisindeki diğer bölümler:
- 📌 **[Oyun Fiziği Nasıl Çalışır? Canvas'ta Sıfırdan Bir Fizik Motoru Yazmak](https://medium.com/@mkare)** — *Euler entegrasyonu, impulse hesabı ve sapan oyununun temelleri.*
- 📌 **[Kalabalık Mahalleyi Dörde Bölmek: Quadtree ile Çarpışma Adaylarını Budamak](https://medium.com/@mkare)** — *Spatial hash'in hiyerarşik alternatifi: Kümelenmiş sahnelerde ağaç yapısıyla aday eleme.*
- 📌 **[İki Kare Arasındaki Kör Nokta: Süpürülmüş AABB ile Tünellemeyi Bitirmek](https://medium.com/@mkare)** — *Hızlı mermilerin duvarların içinden geçmesini engelleyen sürekli çarpışma (CCD) tekniği.*

---

### 👋 Yazar Hakkında
Ben **Mustafa Morbel** — 14 yılı aşkın süredir modern web mimarileri, tarayıcı oyun motorları, WebGL ve yapay zekâ entegrasyonları üzerine geliştirme yapıyorum.

* 20.000 cisimli benchmark testlerini ve kaynak kodları **[GitHub (@mkare)](https://github.com/mkare)** profilimde bulabilirsiniz.
* Yeni teknik makaleler ve mimari analizler için **[LinkedIn](https://linkedin.com/in/mustafamorbel)** ve **[X / Twitter (@mustafamorbel)](https://x.com/mustafamorbel)** üzerinden bağlantı kurabilirsiniz.
* Yoğun fizik sahnelerindeki optimizasyon stratejilerinizi yorumlarda paylaşmayı, faydalı bulduysanız 👏 alkış bırakmayı unutmayın!
