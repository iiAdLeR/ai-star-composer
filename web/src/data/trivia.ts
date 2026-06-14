/**
 * Curated cosmic trivia for the Welcome page's "Did you know?" widget.
 *
 * No backend, no APIs, no accounts — facts are bilingual (EN/TR) and
 * picked deterministically per UTC day so every visitor on the same
 * date sees the same nugget. Sources are cited so this stays
 * educational-grade rather than viral-grade.
 */

export interface TriviaItem {
  id: string;
  topic: "astronomy" | "physics" | "history" | "exploration" | "music";
  en: string;
  tr: string;
  source?: string;
  sourceUrl?: string;
}

export const TRIVIA: TriviaItem[] = [
  {
    id: "mercury-day-longer-than-year",
    topic: "astronomy",
    en: "A day on Mercury (sunrise to sunrise) lasts about 176 Earth days — twice as long as its year.",
    tr: "Merkür'de bir gün (gün doğumundan gün doğumuna) yaklaşık 176 Dünya günü sürer — yılından iki kat uzun.",
    source: "NASA Mercury fact sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html",
  },
  {
    id: "venus-hottest-planet",
    topic: "astronomy",
    en: "Venus is hotter than Mercury — its CO₂ atmosphere traps heat at ~465 °C, the strongest greenhouse effect in the Solar System.",
    tr: "Venüs Merkür'den daha sıcaktır — CO₂ atmosferi ısıyı ~465 °C'de tutar, Güneş Sistemi'nin en güçlü sera etkisi.",
    source: "NASA Venus fact sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html",
  },
  {
    id: "earth-moon-receding",
    topic: "physics",
    en: "The Moon drifts ~3.8 cm farther from Earth every year — measured via Apollo-era retroreflectors.",
    tr: "Ay, her yıl Dünya'dan ~3.8 cm uzaklaşıyor — Apollo döneminden kalan reflektörlerle ölçülüyor.",
    source: "NASA APOLLO LLR",
    sourceUrl: "https://tmurphy.physics.ucsd.edu/apollo/lrrr.html",
  },
  {
    id: "mars-olympus-mons",
    topic: "astronomy",
    en: "Olympus Mons on Mars is ~22 km tall — 2.5× the height of Everest and the largest known volcano in the Solar System.",
    tr: "Mars'taki Olympus Mons ~22 km yüksekliğindedir — Everest'in 2.5 katı ve Güneş Sistemi'nin bilinen en büyük yanardağı.",
    source: "NASA Mars Exploration",
    sourceUrl: "https://mars.nasa.gov/",
  },
  {
    id: "jupiter-great-red-spot",
    topic: "astronomy",
    en: "Jupiter's Great Red Spot has been raging for at least 350 years and could swallow Earth whole.",
    tr: "Jüpiter'in Büyük Kırmızı Lekesi en az 350 yıldır fırtınıyor ve Dünya'yı bütün olarak yutabilir.",
    source: "NASA Juno mission",
    sourceUrl: "https://www.nasa.gov/mission_pages/juno/main/index.html",
  },
  {
    id: "saturn-density",
    topic: "physics",
    en: "Saturn is less dense than water (0.69 g/cm³) — given a big-enough bathtub, it would float.",
    tr: "Satürn sudan daha az yoğundur (0.69 g/cm³) — yeterince büyük bir küvette yüzerdi.",
    source: "NASA Saturn fact sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html",
  },
  {
    id: "uranus-tilt",
    topic: "astronomy",
    en: "Uranus rotates on its side — its 98° axial tilt means each pole gets 42 years of sunlight followed by 42 years of darkness.",
    tr: "Uranüs yan dönüyor — 98°'lik eksen eğimi her kutbun 42 yıl güneş ışığı sonra 42 yıl karanlık görmesi demek.",
    source: "NASA Uranus overview",
    sourceUrl: "https://science.nasa.gov/uranus/",
  },
  {
    id: "neptune-winds",
    topic: "astronomy",
    en: "Neptune has the fastest winds in the Solar System — supersonic gusts up to 2,100 km/h, despite getting just 0.1% of Earth's sunlight.",
    tr: "Neptün, Güneş Sistemi'nin en hızlı rüzgârlarına sahiptir — saatte 2,100 km'ye ulaşan süpersonik esintiler, Dünya'nın güneş ışığının yalnızca %0.1'ini alsa da.",
    source: "NASA Neptune fact sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html",
  },
  {
    id: "voyager-distance",
    topic: "exploration",
    en: "Voyager 1, launched in 1977, is now over 24 billion km from Earth — light from it takes ~22 hours to reach us.",
    tr: "1977'de fırlatılan Voyager 1 şimdi Dünya'dan 24 milyar km uzakta — ondan gelen ışık ~22 saatte bize ulaşıyor.",
    source: "NASA JPL Voyager",
    sourceUrl: "https://voyager.jpl.nasa.gov/",
  },
  {
    id: "kepler-third-law",
    topic: "physics",
    en: "Kepler's 3rd Law (T² ∝ a³) lets you compute an exoplanet's year using only its distance from its star.",
    tr: "Kepler'in 3. Yasası (T² ∝ a³) bir ötegezegenin yılını yalnızca yıldızına olan mesafesini kullanarak hesaplamanı sağlar.",
    source: "Britannica · Kepler's Laws",
    sourceUrl: "https://www.britannica.com/science/Keplers-laws-of-planetary-motion",
  },
  {
    id: "apollo-11",
    topic: "history",
    en: "On 20 July 1969, Apollo 11 landed on the Moon with less computing power than a modern microwave's controller.",
    tr: "20 Temmuz 1969'da Apollo 11, modern bir mikrodalga denetleyicisinden daha az işlem gücüyle Ay'a indi.",
    source: "NASA Apollo 11 page",
    sourceUrl: "https://www.nasa.gov/mission_pages/apollo/apollo11.html",
  },
  {
    id: "sonification-nasa",
    topic: "music",
    en: "NASA has 'sonified' data from Chandra, Hubble, and Webb — turning brightness and distance into pitch and rhythm so astronomy is audible.",
    tr: "NASA, Chandra, Hubble ve Webb verilerini 'sesleştirdi' — parlaklığı ve uzaklığı tona ve ritme çevirerek astronomiyi duyulabilir kıldı.",
    source: "NASA · A Universe of Sound",
    sourceUrl: "https://chandra.harvard.edu/sound/",
  },
  {
    id: "ai-music-history",
    topic: "music",
    en: "The first computer-composed music was the Illiac Suite (1957), generated by an algorithm at the University of Illinois.",
    tr: "İlk bilgisayar bestesi 1957'de Illinois Üniversitesi'nde algoritma ile üretilen Illiac Suite'tir.",
    source: "Illiac Suite — UIUC",
    sourceUrl: "https://en.wikipedia.org/wiki/Illiac_Suite",
  },
  {
    id: "lstm",
    topic: "music",
    en: "Long Short-Term Memory (LSTM) networks, invented in 1997, are the same architecture used here to learn musical phrasing.",
    tr: "1997'de geliştirilen Uzun Kısa-Süreli Bellek (LSTM) ağları, burada müzikal ifadeyi öğrenmek için kullanılan mimarinin aynısıdır.",
    source: "Hochreiter & Schmidhuber 1997",
    sourceUrl: "https://www.bioinf.jku.at/publications/older/2604.pdf",
  },
  {
    id: "horizons",
    topic: "exploration",
    en: "Every position vector in this app comes from NASA JPL's Horizons system — the same ephemeris used to fly missions.",
    tr: "Bu uygulamadaki her konum vektörü NASA JPL Horizons sisteminden — görevleri uçurmak için kullanılan aynı efemeritten — geliyor.",
    source: "NASA JPL Horizons",
    sourceUrl: "https://ssd.jpl.nasa.gov/horizons/",
  },
  {
    id: "speed-of-light",
    topic: "physics",
    en: "Light from the Sun takes ~8 min 20 s to reach Earth, but ~5.5 hours to reach Pluto.",
    tr: "Güneş'ten gelen ışık Dünya'ya ~8 dk 20 sn'de ulaşır, ancak Plüton'a ulaşması ~5.5 saat sürer.",
  },
  {
    id: "jwst-l2",
    topic: "exploration",
    en: "JWST orbits the Sun–Earth L2 Lagrange point, 1.5 million km from Earth — too far for a service mission to ever reach it.",
    tr: "JWST, Dünya'dan 1,5 milyon km uzaktaki Güneş–Dünya L2 Lagrange noktasında dolanır — bakım göreviyle ulaşılamayacak kadar uzakta.",
    source: "NASA JWST",
    sourceUrl: "https://webb.nasa.gov/",
  },
  {
    id: "saturn-rings-thin",
    topic: "astronomy",
    en: "Saturn's rings are 280,000 km wide but typically less than 30 m thick — proportionally thinner than a sheet of paper.",
    tr: "Satürn'ün halkaları 280.000 km genişliğindedir, ancak genellikle 30 m'den daha incedir — bir kağıt parçasından orantısal olarak daha incedir.",
  },
  {
    id: "io-volcanic",
    topic: "astronomy",
    en: "Jupiter's moon Io is the most volcanically active body in the Solar System — Jupiter's gravity tides squeeze it like a stress ball.",
    tr: "Jüpiter'in uydusu Io, Güneş Sistemi'nin volkanik olarak en aktif gök cismidir — Jüpiter'in çekim gelgitleri onu bir stres topu gibi sıkar.",
  },
  {
    id: "europa-ocean",
    topic: "exploration",
    en: "Beneath Europa's ice crust lies an ocean with twice the water of all Earth's oceans combined — a prime target for life-detection missions.",
    tr: "Europa'nın buz kabuğunun altında, Dünya'nın tüm okyanuslarının iki katı su barındıran bir okyanus var — yaşam arama görevleri için birincil hedef.",
    source: "NASA Europa Clipper",
    sourceUrl: "https://europa.nasa.gov/",
  },
];

/**
 * Pick today's trivia deterministically by UTC date.
 *
 * Cycles through the curated list so the same fact appears on the
 * same UTC day for everyone, but rotates daily.
 */
export function getDailyTrivia(now: Date = new Date()): TriviaItem {
  const epoch = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayIndex = Math.floor(epoch / (1000 * 60 * 60 * 24));
  return TRIVIA[dayIndex % TRIVIA.length];
}

/** Like getDailyTrivia but skips the current one (for the "Another fact" button). */
export function getRandomTrivia(currentId?: string): TriviaItem {
  const pool = currentId ? TRIVIA.filter((t) => t.id !== currentId) : TRIVIA;
  return pool[Math.floor(Math.random() * pool.length)];
}
