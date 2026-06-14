/**
 * Glossary of physics + music terms used throughout the app.
 *
 * Each entry has an id (kebab-case, used by `GlossaryTerm` to look up tooltips),
 * an English + Turkish definition, a category and optional `see_also` links.
 *
 * Keep this list curated - it is meant to be 100% trustworthy for a classroom,
 * not a Wikipedia dump.
 */

export type GlossaryCategory = "astronomy" | "physics" | "music" | "ai" | "data";

export interface GlossaryEntry {
  id: string;
  term: string;
  term_tr?: string;
  category: GlossaryCategory;
  short: string;
  short_tr?: string;
  full?: string;
  full_tr?: string;
  examples?: string[];
  examples_tr?: string[];
  see_also?: string[];
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  "orbital-period": {
    id: "orbital-period",
    term: "Orbital period",
    term_tr: "Yörünge periyodu",
    category: "astronomy",
    short: "How long a planet takes to complete one trip around the Sun.",
    short_tr: "Bir gezegenin Güneş etrafında bir tur atması için geçen süre.",
    full:
      "Measured in Earth-days or years. Kepler's third law says the square of the orbital period is proportional to the cube of the semi-major axis.",
    full_tr:
      "Dünya günü veya yıl olarak ölçülür. Kepler'in üçüncü yasasına göre yörünge periyodunun karesi, yarı büyük eksenin küpüyle orantılıdır.",
    examples: [
      "Mercury: 88 days",
      "Earth: 365.25 days",
      "Neptune: 165 years",
    ],
    see_also: ["eccentricity", "semi-major-axis"],
  },
  "eccentricity": {
    id: "eccentricity",
    term: "Eccentricity",
    term_tr: "Eksantriklik",
    category: "astronomy",
    short: "How elongated an orbit is - 0 means a perfect circle.",
    short_tr: "Bir yörüngenin ne kadar uzatılmış olduğunun ölçüsü; 0 mükemmel çember demektir.",
    full:
      "Values between 0 and 1 describe ellipses; equal to 1 the orbit is parabolic (escape); above 1 it is hyperbolic. Mercury has the highest eccentricity (0.21) of the eight planets.",
    full_tr:
      "0 ile 1 arasındaki değerler elipsi tanımlar; 1'e eşitse yörünge paraboliktir (kaçış); 1'in üzerindeyse hiperboliktir. Merkür sekiz gezegen arasında en yüksek eksantrikliğe sahiptir (0.21).",
    see_also: ["orbital-period", "perihelion", "aphelion"],
  },
  "perihelion": {
    id: "perihelion",
    term: "Perihelion",
    term_tr: "Günberi",
    category: "astronomy",
    short: "The closest point in an orbit to the Sun.",
    short_tr: "Bir yörüngede Güneş'e en yakın nokta.",
    examples: ["Earth's perihelion: ~147.1 million km (early January each year)"],
    see_also: ["aphelion", "eccentricity"],
  },
  "aphelion": {
    id: "aphelion",
    term: "Aphelion",
    term_tr: "Günöte",
    category: "astronomy",
    short: "The farthest point in an orbit from the Sun.",
    short_tr: "Bir yörüngede Güneş'e en uzak nokta.",
    examples: ["Earth's aphelion: ~152.1 million km (early July each year)"],
    see_also: ["perihelion", "eccentricity"],
  },
  "semi-major-axis": {
    id: "semi-major-axis",
    term: "Semi-major axis",
    term_tr: "Yarı büyük eksen",
    category: "astronomy",
    short: "Half the longest diameter of an ellipse - the average orbital radius.",
    short_tr: "Bir elipsin en uzun çapının yarısı - ortalama yörünge yarıçapı.",
    see_also: ["orbital-period"],
  },
  "axial-tilt": {
    id: "axial-tilt",
    term: "Axial tilt",
    term_tr: "Eksen eğimi",
    category: "astronomy",
    short: "The angle between a planet's rotation axis and its orbital plane.",
    short_tr: "Bir gezegenin dönüş ekseni ile yörünge düzlemi arasındaki açı.",
    full:
      "Earth's 23.4° tilt drives the seasons. Uranus is tipped almost 98° - it rolls along its orbit rather than spinning upright.",
    full_tr:
      "Dünya'nın 23.4°'lik eğimi mevsimleri yaratır. Uranüs neredeyse 98° eğilmiştir - yörüngesinde yuvarlanır.",
  },
  "retrograde": {
    id: "retrograde",
    term: "Retrograde rotation",
    term_tr: "Retrograd dönüş",
    category: "astronomy",
    short: "Rotating in the opposite direction to most planets - Venus and Uranus do this.",
    short_tr: "Çoğu gezegenin tersi yönünde dönmek - Venüs ve Uranüs böyle döner.",
  },
  "au": {
    id: "au",
    term: "AU (Astronomical Unit)",
    term_tr: "AB (Astronomik Birim)",
    category: "astronomy",
    short: "Earth's average distance from the Sun: 149,597,870.7 km.",
    short_tr: "Dünya'nın Güneş'e ortalama uzaklığı: 149.597.870,7 km.",
  },
  "ephemeris": {
    id: "ephemeris",
    term: "Ephemeris",
    term_tr: "Efemeris",
    category: "data",
    short: "A table of the positions and velocities of celestial bodies over time.",
    short_tr: "Gök cisimlerinin zaman içindeki konum ve hızlarının tablosu.",
    full:
      "NASA's JPL Horizons service provides high-precision ephemerides for every known major and minor body in the solar system - the data source behind every note in this project.",
    full_tr:
      "NASA JPL Horizons servisi, Güneş Sistemi'ndeki tüm büyük ve küçük cisimler için yüksek hassasiyetli efemerisler sağlar - bu projedeki her notanın veri kaynağı.",
    see_also: ["horizons"],
  },
  "horizons": {
    id: "horizons",
    term: "JPL Horizons",
    term_tr: "JPL Horizons",
    category: "data",
    short: "NASA's authoritative service for solar-system ephemerides.",
    short_tr: "NASA'nın Güneş Sistemi efemerisleri için resmi servisi.",
    full:
      "Operated by the Jet Propulsion Laboratory since the 1990s. We query state vectors (position + velocity) for the chosen planet over the chosen window.",
    full_tr:
      "1990'lardan beri Jet Propulsion Laboratory tarafından işletilir. Seçilen gezegen için seçilen pencere boyunca durum vektörlerini (konum + hız) sorgularız.",
    see_also: ["ephemeris"],
  },
  "kepler-laws": {
    id: "kepler-laws",
    term: "Kepler's laws of motion",
    term_tr: "Kepler hareket yasaları",
    category: "physics",
    short: "Three laws describing how planets move around the Sun.",
    short_tr: "Gezegenlerin Güneş etrafındaki hareketini tanımlayan üç yasa.",
    full:
      "1) Orbits are ellipses with the Sun at one focus. 2) A line from a planet to the Sun sweeps equal areas in equal times. 3) The square of the period is proportional to the cube of the semi-major axis.",
    full_tr:
      "1) Yörüngeler odaklarından birinde Güneş bulunan elipslerdir. 2) Bir gezegenden Güneş'e çizilen doğru eşit zamanlarda eşit alanlar tarar. 3) Periyodun karesi, yarı büyük eksenin küpüyle orantılıdır.",
    see_also: ["orbital-period", "eccentricity"],
  },
  "delta-v": {
    id: "delta-v",
    term: "Delta-v (Δv)",
    term_tr: "Delta-v (Δv)",
    category: "physics",
    short: "The change in velocity needed for a spacecraft maneuver.",
    short_tr: "Bir uzay aracı manevrası için gereken hız değişimi.",
    full:
      "Measured in km/s. Hohmann transfer orbits minimise Δv between two coplanar circular orbits - the canonical 'cheap' interplanetary trajectory.",
  },
  "hohmann-transfer": {
    id: "hohmann-transfer",
    term: "Hohmann transfer",
    term_tr: "Hohmann transferi",
    category: "physics",
    short: "An energy-efficient orbital maneuver between two circular orbits.",
    short_tr: "İki dairesel yörünge arasında enerji açısından verimli bir manevra.",
    see_also: ["delta-v"],
  },
  // --- Sonification / music ----------------------------------------------
  "sonification": {
    id: "sonification",
    term: "Sonification",
    term_tr: "Sonifikasyon",
    category: "music",
    short: "Turning non-audio data into sound to reveal patterns.",
    short_tr: "Ses olmayan verileri, kalıpları ortaya çıkarmak için sese dönüştürmek.",
    full:
      "A complement to data visualisation. NASA's Astronify and SYSTEM Sounds projects have demonstrated its educational and scientific value.",
    full_tr:
      "Veri görselleştirmesini tamamlar. NASA'nın Astronify ve SYSTEM Sounds projeleri eğitsel ve bilimsel değerini göstermiştir.",
  },
  "midi": {
    id: "midi",
    term: "MIDI",
    term_tr: "MIDI",
    category: "music",
    short: "A standard for representing musical events digitally (notes, timing, velocity).",
    short_tr: "Müzikal olayları dijital olarak temsil eden bir standart (nota, zamanlama, hız).",
    full:
      "Musical Instrument Digital Interface. Each note has a pitch (0–127), a velocity (0–127), a start time and a duration. MIDI files are small and editable in any DAW.",
    full_tr:
      "Müzikal Enstrüman Dijital Arayüzü. Her notada bir yükseklik (0–127), hız (0–127), başlangıç ​​zamanı ve süre vardır. MIDI dosyaları küçüktür ve herhangi bir DAW'da düzenlenebilir.",
    see_also: ["velocity", "pitch"],
  },
  "pitch": {
    id: "pitch",
    term: "Pitch",
    term_tr: "Perde",
    category: "music",
    short: "How high or low a note sounds. Doubling the frequency raises pitch by one octave.",
    short_tr: "Bir notanın ne kadar tiz veya pes olduğu. Frekansı iki katına çıkarmak perdeyi bir oktav yükseltir.",
  },
  "velocity": {
    id: "velocity",
    term: "Velocity (MIDI)",
    term_tr: "Hız (MIDI)",
    category: "music",
    short: "How forcefully a note is played - controls loudness and often timbre.",
    short_tr: "Bir notanın ne kadar güçlü çalındığı - ses seviyesini ve genellikle tınıyı kontrol eder.",
    see_also: ["midi"],
  },
  "bpm": {
    id: "bpm",
    term: "BPM (beats per minute)",
    term_tr: "BPM (dakikadaki vuruş)",
    category: "music",
    short: "The tempo of a piece. Higher BPM = faster music.",
    short_tr: "Bir parçanın temposu. Daha yüksek BPM = daha hızlı müzik.",
  },
  "scale": {
    id: "scale",
    term: "Musical scale",
    term_tr: "Müzikal gam",
    category: "music",
    short: "A selected set of notes used as the palette of a piece.",
    short_tr: "Bir parçanın paleti olarak kullanılan seçilmiş bir nota kümesi.",
    examples: ["Major", "Minor", "Pentatonic", "Dorian"],
  },
  "key-major-minor": {
    id: "key-major-minor",
    term: "Major vs minor key",
    term_tr: "Majör vs minör ton",
    category: "music",
    short: "Major keys sound bright/happy; minor keys sound dark/serious.",
    short_tr: "Majör tonlar parlak/neşeli; minör tonlar karanlık/ciddi ses verir.",
    full:
      "The difference comes from the third scale degree: a major third is 4 semitones above the tonic; a minor third is 3 semitones above.",
    full_tr:
      "Fark, gamın üçüncü derecesinden kaynaklanır: majör üçlü tonikten 4 yarıton yukarıda; minör üçlü 3 yarıton yukarıdadır.",
    see_also: ["scale"],
  },
  "harmony": {
    id: "harmony",
    term: "Harmony",
    term_tr: "Armoni",
    category: "music",
    short: "Notes sounded together to form chords supporting the melody.",
    short_tr: "Melodiyi destekleyen akorları oluşturmak için birlikte çalınan notalar.",
  },
  "timbre": {
    id: "timbre",
    term: "Timbre",
    term_tr: "Tını",
    category: "music",
    short: "The 'color' of a sound that makes a flute and a violin distinguishable on the same note.",
    short_tr: "Aynı notada bir flütü ve kemanı ayırt edilebilir kılan sesin 'rengi'.",
  },
  "octave": {
    id: "octave",
    term: "Octave",
    term_tr: "Oktav",
    category: "music",
    short: "A distance of 12 semitones - the same note name, doubled in frequency.",
    short_tr: "12 yarı tonluk bir aralık - aynı nota adı, frekans iki katına çıkar.",
  },
  // --- AI / ML ------------------------------------------------------------
  "lstm": {
    id: "lstm",
    term: "LSTM (Long Short-Term Memory)",
    term_tr: "LSTM (Uzun Kısa Süreli Bellek)",
    category: "ai",
    short: "A neural network for sequences - remembers past notes when predicting the next one.",
    short_tr: "Diziler için sinir ağı - bir sonrakini tahmin ederken geçmiş notaları hatırlar.",
    full:
      "A type of recurrent neural network introduced by Hochreiter & Schmidhuber in 1997. Excellent for melodies because they have long-range musical dependencies.",
    full_tr:
      "Hochreiter ve Schmidhuber tarafından 1997'de tanıtılan bir tür yinelemeli sinir ağı. Melodiler için mükemmeldir çünkü uzun mesafeli müzikal bağımlılıkları vardır.",
  },
  "temperature": {
    id: "temperature",
    term: "Sampling temperature",
    term_tr: "Örnekleme sıcaklığı",
    category: "ai",
    short: "Controls how predictable the AI is - low = repetitive, high = chaotic.",
    short_tr: "AI'nın ne kadar öngörülebilir olduğunu kontrol eder - düşük = tekrarlayan, yüksek = kaotik.",
    full:
      "Mathematically, it scales the logits before softmax. Below 1 sharpens the distribution; above 1 flattens it. Our default 0.92 keeps choices musical without freezing into loops.",
    full_tr:
      "Matematiksel olarak, softmax'tan önce logit'leri ölçeklendirir. 1'in altı dağılımı keskinleştirir; üstü düzleştirir. Varsayılan 0.92 değerimiz, döngülere donmadan müzikal seçimler yapmayı sağlar.",
    see_also: ["lstm"],
  },
  "wilcoxon": {
    id: "wilcoxon",
    term: "Wilcoxon signed-rank test",
    term_tr: "Wilcoxon işaretli sıra testi",
    category: "ai",
    short: "A non-parametric statistical test comparing paired samples.",
    short_tr: "Eşli örnekleri karşılaştıran parametrik olmayan istatistiksel test.",
    full:
      "Used in our Quality Dashboard to compare AI vs baseline on identical seeds. Robust to non-Gaussian distributions - important because musical metrics rarely follow a normal distribution.",
    full_tr:
      "AI'yı temele aynı tohumlarda karşılaştırmak için Kalite Panomuzda kullanılır. Gauss olmayan dağılımlara karşı dayanıklıdır - müzikal ölçütler nadiren normal dağılım gösterdiği için önemlidir.",
  },
  "shannon-entropy": {
    id: "shannon-entropy",
    term: "Shannon entropy",
    term_tr: "Shannon entropisi",
    category: "ai",
    short: "Measures how varied a sequence is - higher entropy = more diversity.",
    short_tr: "Bir dizinin ne kadar çeşitli olduğunu ölçer - daha yüksek entropi = daha fazla çeşitlilik.",
    full:
      "Introduced by Claude Shannon in 1948 for information theory. In our context, pitch entropy tells us how 'rich' a melody's note palette is - useful for distinguishing repetitive baselines from varied AI compositions.",
    full_tr:
      "Claude Shannon tarafından 1948'de bilgi teorisi için tanıtıldı. Bizim bağlamımızda perde entropisi, bir melodinin nota paletinin ne kadar 'zengin' olduğunu söyler - tekrarlayan temelleri çeşitli AI bestelerinden ayırt etmek için kullanışlıdır.",
    see_also: ["wilcoxon"],
  },
  "effect-size": {
    id: "effect-size",
    term: "Effect size (Cohen's d_z)",
    term_tr: "Etki büyüklüğü (Cohen's d_z)",
    category: "ai",
    short: "Quantifies how big a difference is, beyond statistical significance.",
    short_tr: "İstatistiksel anlamlılığın ötesinde bir farkın ne kadar büyük olduğunu nicelleştirir.",
    full:
      "Convention: 0.2 = small, 0.5 = medium, 0.8 = large. A large effect size with a low p-value is the gold standard for a 'real' difference.",
    full_tr:
      "Konvansiyon: 0.2 = küçük, 0.5 = orta, 0.8 = büyük. Düşük p-değerine sahip büyük bir etki büyüklüğü, 'gerçek' bir fark için altın standarttır.",
    see_also: ["wilcoxon"],
  },
};

export const GLOSSARY_LIST: GlossaryEntry[] = Object.values(GLOSSARY).sort((a, b) =>
  a.term.localeCompare(b.term),
);

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY[id];
}
