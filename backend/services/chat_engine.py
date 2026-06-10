"""
Chat Engine — Local intent detection + semantic search routing.

Zero external API calls. All processing is local:
  - Rule-based intent classification
  - Turkish title alias resolution
  - Routes all queries to hybrid semantic search with entity boost multipliers
"""
import re
import logging
from difflib import SequenceMatcher
from typing import Optional

logger = logging.getLogger("chat_engine")

# ═══════════════════════════════════════════════════════════════
# TURKISH TITLE ALIASES — popular movies known by Turkish names
# ═══════════════════════════════════════════════════════════════
TURKISH_TITLE_ALIASES = {
    "esaretin bedeli": "The Shawshank Redemption",
    "baba": "The Godfather",
    "kara şövalye": "The Dark Knight",
    "başlangıç": "Inception",
    "yüzüklerin efendisi": "The Lord of the Rings",
    "zindan adası": "Shutter Island",
    "dövüş kulübü": "Fight Club",
    "yıldızlararası": "Interstellar",
    "ucuz roman": "Pulp Fiction",
    "yeşil yol": "The Green Mile",
    "forrest gump": "Forrest Gump",
    "matriks": "The Matrix",
    "matrix": "The Matrix",
    "terminatör": "The Terminator",
    "yüzük kardeşliği": "The Fellowship of the Ring",
    "iki kule": "The Two Towers",
    "kralın dönüşü": "The Return of the King",
    "gladyatör": "Gladiator",
    "prestij": "The Prestige",
    "schindlerin listesi": "Schindler's List",
    "schindler'in listesi": "Schindler's List",
    "cesur yürek": "Braveheart",
    "hayalet": "Ghost",
    "titanik": "Titanic",
    "avatar": "Avatar",
    "yıldız savaşları": "Star Wars",
    "jurassik park": "Jurassic Park",
    "jurassic park": "Jurassic Park",
    "harry potter": "Harry Potter",
    "hobbit": "The Hobbit",
    "parazit": "Parasite",
    "ruhların kaçışı": "Spirited Away",
    "sessiz kuzu": "The Silence of the Lambs",
    "amerikan güzeli": "American Beauty",
    "güzel zihinler": "A Beautiful Mind",
    "karayip korsanları": "Pirates of the Caribbean",
    "labirent": "The Maze Runner",
    "açlık oyunları": "The Hunger Games",
    "ölü ozanlar derneği": "Dead Poets Society",
    "kelebek etkisi": "The Butterfly Effect",
    "kayıp balık nemo": "Finding Nemo",
    "yukarı bak": "Up",
    "coco": "Coco",
    "ratatuy": "Ratatouille",
    "ratatouille": "Ratatouille",
    "ters yüz": "Inside Out",
    "oyuncak hikayesi": "Toy Story",
    "aslan kral": "The Lion King",
    "karlar ülkesi": "Frozen",
    "duvar-e": "WALL-E",
    "wall-e": "WALL-E",
    "inanılmaz aile": "The Incredibles",
    "canavar şirketi": "Monsters, Inc.",
    "arka sokaklar": "Rear Window",
    "sapık": "Psycho",
    "uzay yolu": "Star Trek",
    "geleceğe dönüş": "Back to the Future",
    "yağmur adam": "Rain Man",
    "guguk kuşu": "One Flew Over the Cuckoo's Nest",
    "taksici": "Taxi Driver",
    "kuzuların sessizliği": "The Silence of the Lambs",
    "talihsiz olaylar dizisi": "A Series of Unfortunate Events",
    "büyük lebowski": "The Big Lebowski",
    "dokunulmaz": "Intouchables",
    "dokunulmazlar": "Intouchables",
    "cennet cumhuriyeti": "La vita è bella",
    "hayat güzeldir": "La vita è bella",
    "amelie": "Amélie",
    "kaynak": "The Fountain",
    "savaş atı": "War Horse",
    "kör nokta": "The Blind Side",
    "yetenekli bay ripley": "The Talented Mr. Ripley",
    "kayıp kız": "Gone Girl",
    "kovboy": "No Country for Old Men",
    "ihtiyarlara yer yok": "No Country for Old Men",
    "kaptan phillips": "Captain Phillips",
    "marslı": "The Martian",
    "varış": "Arrival",
    "dune": "Dune",
    "düello": "The Prestige",
    "tenet": "Tenet",
    "oppenheimer": "Oppenheimer",
    "barbie": "Barbie",
    "joker": "Joker",
    "batman": "The Batman",
    "örümcek adam": "Spider-Man",
    "demir adam": "Iron Man",
    "kaptan amerika": "Captain America",
    "yenilmezler": "The Avengers",
    "kara panter": "Black Panther",
    "deadpool": "Deadpool",
}

# ═══════════════════════════════════════════════════════════════
# INTENT DETECTION PATTERNS
# ═══════════════════════════════════════════════════════════════
SIMILAR_PATTERNS = [
    r"(.+?)\s*gibi\b",
    r"(.+?)\s*tarzı\b",
    r"(.+?)\s*tadında\b",
    r"(.+?)\s*benzeri\b",
    r"(.+?)\s*havasında\b",
    r"(.+?)\s*havası\b",
    r"(.+?)\s*ayarında\b",
    r"(.+?)\s*tarzında\b",
    r"(.+?)\s*tadı\b",
    r"(.+?)['']?[eaıiuü]\s+benzeyen\b",
    r"(.+?)['']?[eaıiuü]\s+benzer\b",
    r"(.+?)\s+gibi\s+(?:bir\s+)?film",
    r"(.+?)\s+(?:gibisini|gibileri)\b",
    # ── İngilizce benzerlik kalıpları ──
    r"something\s+like\s+(.+)",
    r"similar\s+to\s+(.+)",
    r"movies?\s+like\s+(.+)",
    r"films?\s+like\s+(.+)",
    r"in\s+the\s+style\s+of\s+(.+)",
    r"(.+?)\s+vibes?\b",
    r"\blike\s+(.+)",
]

# "X ile Y ortası" — iki referanslı karışım (blend) kalıpları
BLEND_PATTERNS = [
    r"(.+?)\s+ile\s+(.+?)\s+(?:ortası|ortasında|arası|arasında|karışımı|karması|karısımı)\b",
    r"(.+?)\s+ve\s+(.+?)\s+(?:karışımı|karması|ortası|arası|karısımı)\b",
    r"(.+?)\s+ile\s+(.+?)\s+(?:gibi|tarzı|tarzında)\b",
    r"(?:hem)\s+(.+?)\s+hem\s+(?:de\s+)?(.+?)\s+(?:gibi|tarzı)\b",
]

PERSON_KEYWORDS = [
    "filmi", "filmleri", "filmlerini", "filmini",
    "oynadığı", "rol aldığı", "çektiği",
    "filmografisi", "başrolde", "yönetmenliğini",
]

DIRECTOR_KEYWORDS = [
    "yönetmen", "yönetmenin", "yönetmeninin", "çektiği",
    "yönetmenliğini", "yönetmenliğinde",
]

FEEDBACK_PATTERNS = {
    "daha farklı": "diversity",
    "farklı bir şey": "diversity",
    "bunları istemiyorum": "reject_all",
    "istemiyorum": "reject_all",
    "daha hafif": "lighter",
    "daha ağır": "heavier",
    "daha karanlık": "darker",
    "daha aydınlık": "lighter",
    "daha komik": "funnier",
    "daha yeni": "newer",
    "daha eski": "older",
    "daha kısa": "shorter",
    "daha uzun": "longer",
    "daha popüler": "more_popular",
    "daha az bilinen": "less_known",
    "bunu izledim": "seen_it",
    "hepsini izledim": "seen_all",
    "başka": "diversity",
    "değiştir": "diversity",
}

# "X gibi ama daha Y" — similar + trailing modifier eşlemesi (sıfır-API)
# FEEDBACK_PATTERNS ile aynı değer uzayını kullanır (newer/older/...) +
# tür-yakınlığı modifier'ları (funnier/darker/lighter/heavier/scarier/romantic).
_SIMILAR_MODIFIER_MAP = {
    "daha yeni": "newer",
    "daha guncel": "newer",
    "daha eski": "older",
    "daha klasik": "older",
    "daha kisa": "shorter",
    "daha uzun": "longer",
    "daha populer": "more_popular",
    "daha bilinen": "more_popular",
    "daha az bilinen": "less_known",
    "daha az populer": "less_known",
    "daha kult": "less_known",
    "daha komik": "funnier",
    "daha eglenceli": "funnier",
    "daha karanlik": "darker",
    "daha agir": "heavier",
    "daha sert": "heavier",
    "daha gergin": "darker",
    "daha hafif": "lighter",
    "daha aydinlik": "lighter",
    "daha duygusal": "heavier",
    "daha dramatik": "heavier",
    "daha romantik": "romantic",
    "daha korkutucu": "scarier",
    "daha urpertici": "scarier",
    "daha yavas": "slower",
    "daha yavas tempolu": "slower",
    "daha hizli": "faster",
    "daha hizli tempolu": "faster",
    "daha aksiyonlu": "heavier",
    "daha sakin": "lighter",
    "daha yogun": "heavier",
}


def _extract_similar_modifier(text: str):
    """'X gibi ama daha Y' içindeki Y modifier'ını döndürür (yoksa None)."""
    t = _fold(text)
    best = None
    best_len = 0
    for phrase, mod in _SIMILAR_MODIFIER_MAP.items():
        if phrase in t and len(phrase) > best_len:
            best = mod
            best_len = len(phrase)
    return best


MOOD_KEYWORDS = {
    "istiyorum", "istemiyorum", "olsun", "olmasın", "arıyorum",
    "yorgun", "mutlu", "üzgün", "heyecanlı", "sakin", "sıkıldım",
    "ağlamak", "gülmek", "düşünmek", "gerilmek", "korkmak",
    "rahatlamak", "kafamı", "kafam", "dağıl", "dağılsın", "dalgın",
    "boşver", "boş", "ruh", "duygu", "hissetmek", "hissediyorum",
    "bugün", "bu gece", "bu akşam", "şu an", "şimdi",
    "hafif", "ağır", "karanlık", "aydınlık", "romantik", "komik",
    "duygusal", "hüzünlü", "eğlenceli", "gerilimli", "korkutucu",
    "aksiyonlu", "macera", "fantastik", "bilim kurgu",
    "ailemle", "arkadaşlarla", "yalnız", "sevgilimle",
    "öner", "önersene", "önerir misin", "ne izlesem", "ne izleyeyim",
    "tavsiye", "bir şey", "film seç", "film bul",
    # Süre / zaman kısıtı
    "dakika", "dakikalık", "şipşak", "kısa", "vaktim", "saat",
    # Tema / tarz sinyalleri — film adı sanılmasını önler
    "kült", "gizli", "distopik", "distopya", "taşra", "kasvet",
    "psikolojik", "delilik", "çöküş", "paranoya", "travma",
    "noir", "indie", "antihero", "obsesyon", "intikam",
    "ters", "twist", "ödüllü", "festival", "bağımsız",
    "ürperten", "ürpertici", "kasvetli", "loş", "hırs",
    "yapıtlar", "yapıt", "hikayesi", "hikayeleri", "tarzı",
    # Bağlaç / tanımlayıcı — film adında genellikle bulunmaz, tanımlama cümlelerinde bulunur
    "ile", "anlatan", "barındıran", "hakkında", "dair", "içeren",
    # Aşk/duygu çekimleri — "aşk" köklü ama çekimli (filmin değil isteğin parçası)
    "aşkı", "aşkın", "aşkla", "aşkını", "sevgisi", "sevgiyle", "sevgiyi",
    # Konuya işaret eden sıfatlar
    "felsefi", "derin", "varoluşsal", "sorgulayan",
    # Soyut / şiirsel ruh hali
    "melankoli", "melankolik", "umutsuz", "umutsuzum", "umut", "huzur",
    "boşluk", "boşlukta", "daralıyor", "daraldı", "küstüm", "sıkışıyor",
    "boğuluyorum", "yalnızlık", "yalnızım", "hüzünlüyüm", "özlem", "özledim",
    "ısıtacak", "ısıtsın", "feels", "duygulanmak", "dağıtmak", "dağılmak",
    "buruk", "kırgın", "yorgunum", "bitkin", "tükendim", "ağlatsın",
}

# Tümce düzeyinde ruh hali/distraction ifadeleri — kelime bazlı mood kontrolünden ÖNCE kontrol edilir.
# Bunlar actor/director sanılmamalı.
# Uzun metinlerde bile tespit edilebilmek için çeşitli tense/varyasyonlar içerir.
MOOD_PHRASES = {
    # ── Sıkılma / Bıkkınlık ──
    "canım sıkıldı", "canım sıkılıyor", "canım çok sıkıldı", "sıkıldım", "çok sıkıldım",
    "sıkılıyorum", "canım sıkkın", "sıkıcı", "bıktım", "bunaldım",
    # ── Yorgunluk / Enerjisizlik ──
    "yorgunum", "çok yorgunum", "yorgun hissediyorum", "bitkin", "bitkin düştüm",
    "uykum var", "uykusuzum", "uykusuz", "enerjim yok", "enerjim kalmadı",
    # ── Kafa dağıtma / Rahatlama ──
    "kafam dağılsın", "kafamı dağıt", "kafam dağınık", "kafam çok dağınık",
    "kafam bulanık", "dağılmak istiyorum", "beyin yorgunu", "dalgın",
    "rahatlamak istiyorum", "rahatlatıcı", "gevşemek",
    # ── Stres / Gerginlik ──
    "stresliyim", "çok stresliyim", "stres", "gergin", "gerginim", "sinirli", "sinirliyim",
    # ── Kararsızlık / Boşvermişlik ──
    "ne bileyim", "bilmiyorum", "kararsız", "kararsızım",
    "bir şey", "herhangi bir şey", "rastgele", "boşver", "boş",
    # ── Zaman geçirme ──
    "zaman geçsin", "zaman geçirmek", "zaman geçireyim",
    "vakit geçsin", "vakit geçirmek", "vakit öldürmek",
    # ── Keyifsizlik / Moral ──
    "keyfim yok", "keyfim yerinde değil", "keyifsiz", "keyifsizim",
    "moralim bozuk", "moralim çok bozuk", "üzgün hissediyorum",
    "mutlu değilim", "canım istemiyor",
    # ── Genel istek / Arayış ──
    "ne izlesem", "ne izleyeyim", "film öner", "öneri", "bir şeyler izlemek",
    "bir film izlemek", "izleyecek bir şey", "izleme", "seyredeyim",
    # ── Duygu durumu belirtme ──
    "eğlenmek istiyorum", "gülmek istiyorum", "eğlenceli bir şey",
    "heyecan istiyorum", "heyecanlı bir şey", "macera istiyorum",
    "romantik bir şey", "duygusal bir şey", "hafif bir şey",
    "derin bir film", "düşündüren", "felsefi bir şey", "dokunaklı",
    "korku istiyorum", "gerilim istiyorum", "aksiyon istiyorum",
    "komedi istiyorum", "dram istiyorum", "bilim kurgu istiyorum",
    # ── Tema / tarz ifadeleri ──
    "kült yapıtlar", "gizli kalmış", "az bilinen", "değeri bilinmeyen",
    "psikolojik çöküş", "ters köşe", "sürpriz son",
    "taşra kasveti", "distopik bilimkurgu", "sanat filmi",
    "tempo düşmeyen", "temposu hiç düşmeyen",
    "dakikalık", "şipşak",
    # ── İngilizce ruh hali ifadeleri (yabancı dil sorguları) ──
    "i'm sad", "im sad", "feeling sad", "i feel sad", "feeling down",
    "i'm tired", "im tired", "feeling tired", "i'm bored", "im bored",
    "i'm happy", "feeling happy", "i want to cry", "wanna cry",
    "make me laugh", "something funny", "something light", "something scary",
    "something sad", "something romantic", "feel good", "feel-good",
    "i'm stressed", "im stressed", "relaxing", "something relaxing",
    "what should i watch", "recommend me", "suggest me a movie",
    "i don't know what to watch", "cheer me up", "mind bending",
    # ── Soyut / şiirsel ruh hali (Türkçe) ──
    "içim daralıyor", "içim sıkışıyor", "içim daraldı", "hayata küstüm",
    "ait olamıyorum", "ait olamamak", "kendimi boşlukta", "boşlukta hissediyorum",
    "umudum yok", "umutsuzum", "içimi ısıtacak", "içimi ısıtsın",
    "huzur bulmak", "huzura ihtiyacım", "kafayı yedim", "aklımı başımdan alacak",
    "kafamı dağıtayım", "dağıtmak istiyorum", "çok feels", "feels veren",
    "ruhum yorgun", "yorgun düştüm", "moralim yerlerde", "içim karardı",
    "ağlamak istiyorum ama", "gülmek istiyorum ama",
    # ── Argo / internet memeleri ──
    "fena sarmak", "müq film", "müthiş film", "çok iyi film", "kafa yapan", "kafa yapar",
    "fena film", "aşırı iyi", "boş film", "kafa boşalt", "kafamı boşalt",
    "dizi gibi film", "akıcı film", "sarıyor", "sarmıyor", "sarar",
    "çerezlik film", "izlemesi keyifli", "izlemesi zevkli",
    # ── Ek İngilizce ifadeler ──
    "something like", "i want a movie about", "show me something",
    "i want something", "give me a movie", "i need a movie",
    "looking for a movie", "looking for something",
    "a movie about", "any movie", "any film", "suggest something",
    "i feel like watching", "feeling like", "in the mood for",
    "blow my mind", "mind blowing", "mind-blowing",
    "thought provoking", "eye opening", "eye-opening",
    "edge of my seat", "edge of your seat", "keep me guessing",
    "heart warming", "heartwarming", "feel-good",
    # ── Soyut / metaforik ──
    "mavi hüzün", "sessiz çığlık", "içimdeki fırtına", "bulutların üstünde",
    "derin sularda", "kaybolmak istiyorum", "kendimi kaybetmek",
    "başka bir dünya", "başka bir evren", "rüya gibi",
    "içimi ısıt", "içimi ısıtacak", "ruhumu dinlendir",
    "zihnimi dinlendir", "düşüncelerden kaçış",
}

# Tek kelimelik ünlü yönetmen/oyuncu adları — _looks_like_person_name tek kelime için de çalışsın.
# Soyadı tek başına yazıldığında bile TMDB kişi aramasına yönlendirilir
# (örn. "eggers filmi", "lanthimos tarzı"). Tireli/iki kelimelik isimler
# _looks_like_person_name heuristic'i ile ayrıca yakalanır.
KNOWN_PERSONS = {
    # ── Klasik / usta yönetmenler ──
    "tarantino", "nolan", "kubrick", "scorsese", "ceylan", "spielberg",
    "hitchcock", "fellini", "bergman", "kurosawa", "lynch", "fincher",
    "villeneuve", "tarkovsky", "herzog", "haneke", "kieslowski",
    "kusturica", "polanski", "coppola", "godard", "truffaut",
    "klein", "reiner", "ersoy", "sorrentino", "haggis", "cameron",
    "cronenberg", "demir", "şener", "emre yükselen", "martin eden",
    "ozu", "mizoguchi", "antonioni", "visconti", "pasolini", "rossellini",
    "wilder", "ford", "hawks", "welles", "kazan", "lean", "leone",
    "altman", "malick", "lumet", "cassavetes", "varda", "resnais",
    # ── Çağdaş auteur'ler ──
    "aster", "eggers", "gerwig", "lanthimos", "peele", "chazelle",
    "inarritu", "iñárritu", "del toro", "refn", "baumbach", "payne",
    "mcdonagh", "ramsay", "glazer", "östlund", "ostlund", "hamaguchi",
    "koreeda", "kore-eda", "bong", "park chan-wook", "wong kar-wai",
    "almodovar", "almodóvar", "farhadi", "kiarostami", "panahi",
    "audiard", "ozon", "dolan", "garrone", "haynes", "anderson",
    "aronofsky", "iñarritu", "zhang yimou", "jia zhangke", "weerasethakul",
    # ── Türk yönetmenler ──
    "demirkubuz", "akın", "kaplanoğlu", "alper", "ustaoğlu",
    "pirselimoğlu", "erdem", "yeşilçam", "kemp",
    # ── Eklenen (önceki eksik) ──
    "jodorowsky", "alex jodorowsky",
    "herzog", "werner herzog",
    "tarkovsky", "andrei tarkovsky", "tarkovski",
    "kieslowski", "kieslowski",
    "ozu", "yasujiro ozu",
    "mizoguchi", "kenji mizoguchi",
    "bresson", "robert bresson",
    "godard", "jean-luc godard",
    "truffaut", "francois truffaut",
    "fellini", "federico fellini",
    "bergman", "ingmar bergman",
    "kurosawa", "akira kurosawa",
    "wong kar-wai", "wong kar wai",
    "park chan-wook", "park chan wook", "chan-wook",
    "bong joon-ho", "bong joon ho", "bong",
    "lee chang-dong", "lee chang dong",
    "hamaguchi", "ryusuke hamaguchi",
    "kore-eda", "koreeda", "hirokazu kore-eda",
    "miyazaki", "hayao miyazaki",
    # ── Ek oyuncular ──
    "joaquin phoenix", "phoenix",
    "cate blanchett", "blanchett",
    "meryl streep", "streep",
    "daniel day-lewis", "daniel day lewis",
    "gary oldman", "oldman",
    "morgan freeman", "freeman",
    "christian bale", "bale",
    "heath ledger", "ledger",
    "jake gyllenhaal", "gyllenhaal",
    "tom hardy", "hardy",
    "leonardo dicaprio", "dicaprio",
    "brad pitt", "pitt",
    "robert de niro", "deniro",
    "al pacino", "pacino",
    "anthony hopkins", "hopkins",
    "samuel l jackson", "samuel jackson", "jackson",
    # ── Oyuncular ──
    "pitt", "dicaprio", "deniro", "pacino", "hopkins", "streep",
    "roberts", "hanks", "blanchett", "phoenix",     "gosling", "bale",
    "fassbender", "oldman", "freeman", "washington", "nicholson",
    "cumberbatch", "mcconaughey", "waltz", "swinton",
    "dafoe", "pattinson", "hathaway", "portman", "jolie",
    "roberts", "chastain", "adams", "stone", "lawrence",
    "ryder", "kidman", "foster", "mirren", "dench",
    "keanu reeves", "reeves", "keanu",
    "tom cruise", "cruise",
    "will smith", "scarlett johansson", "johansson",
    "ryan gosling", "emma stone", "timothee chalamet", "chalamet",
    "florence pugh", "pugh", "zendaya",
    "margot robbie", "robbie", "austin butler", "butler",
    "denzel washington", "matt damon", "damon",
    "russell crowe", "crowe", "ben affleck", "affleck",
    "kate winslet", "winslet", "viola davis",
    "anya taylor-joy", "anya taylor joy",
}


# ═══════════════════════════════════════════════════════════════
# STREAMING PLATFORMS — provider_filter intent tespiti için
# ═══════════════════════════════════════════════════════════════
# TMDB watch-provider ID'leri (TR bölgesi) — frontend streamingMemory.js ile uyumlu.
# label: kullanıcıya gösterilecek görünen ad.
STREAMING_PLATFORMS = {
    "netflix":      {"aliases": ["netflix", "netflıx"],                       "provider_id": 8,    "label": "Netflix"},
    "amazon prime": {"aliases": ["amazon prime", "prime video", "amazon"],    "provider_id": 119,  "label": "Amazon Prime"},
    "disney+":      {"aliases": ["disney plus", "disney+", "disney"],         "provider_id": 337,  "label": "Disney+"},
    "mubi":         {"aliases": ["mubi"],                                     "provider_id": 11,   "label": "MUBI"},
    "blutv":        {"aliases": ["blutv", "blu tv"],                          "provider_id": 341,  "label": "BluTV"},
    "exxen":        {"aliases": ["exxen"],                                    "provider_id": 1968, "label": "Exxen"},
    "apple tv":     {"aliases": ["apple tv", "appletv", "apple tv+"],         "provider_id": 350,  "label": "Apple TV+"},
    "max":          {"aliases": ["hbo max", "hbomax", "max"],                 "provider_id": 1899, "label": "Max"},
    "paramount+":   {"aliases": ["paramount", "paramount+"],                  "provider_id": 531,  "label": "Paramount+"},
    "tabii":        {"aliases": ["tabii"],                                    "provider_id": 2235, "label": "tabii"},
    "gain":         {"aliases": ["gain"],                                     "provider_id": 1898, "label": "Gain"},
    "puhu":         {"aliases": ["puhutv", "puhu tv", "puhu"],                "provider_id": 1796, "label": "puhuTV"},
    "crunchyroll":  {"aliases": ["crunchyroll"],                              "provider_id": 283,  "label": "Crunchyroll"},
}

# Erişim/availability ipuçları + durum ekleri — "netflix yapımı" (üretim şirketi)
# ile "netflix'te olan" (erişilebilirlik) ayrımı için.
_PLATFORM_AVAIL_CUES = (
    "olan", "var", "izle", "seyret", "mevcut", "bulunan", "yayinda",
    "eklenen", "izlenecek", "cikan", "nerede", "hangi", "neler",
)
_PLATFORM_LOC_SUFFIXES = ("te", "de", "da", "ta", "ten", "den", "dan", "tan", "deki", "daki", "teki", "taki")

# ═══════════════════════════════════════════════════════════════
# SLANG / INTERNET DILI — günlük konuşma ifadeleri
# ═══════════════════════════════════════════════════════════════
SLANG_MOOD_MAP = {
    "fena sarmak":    {"adrenalin": 0.8, "kahkaha": 0.5},
    "müq film":       {"sessiz": 0.6, "kalp": 0.5},
    "müthiş film":    {"sessiz": 0.5, "kalp": 0.5},
    "çok iyi film":   {"sessiz": 0.5, "zihin": 0.5},
    "banger":         {"adrenalin": 0.9, "sipsak": 0.3},
    "underrated":     {"karmakar": 0.5, "zihin": 0.4},
    "overrated":      {"karmakar": 0.3, "zihin": 0.3},
    "kafa yapan":     {"zihin": 0.8, "karmakar": 0.5},
    "kafa yapar":     {"zihin": 0.8, "karmakar": 0.5},
    "bayıldım":       {"kalp": 0.7, "sessiz": 0.3},
    "fena film":      {"adrenalin": 0.7, "gece": 0.4},
    "aşırı iyi":      {"kahkaha": 0.6, "adrenalin": 0.4},
    "boş film":       {"kalp": 0.6, "sessiz": 0.4},
    "kafa boşalt":    {"kahkaha": 0.7, "battaniye": 0.5},
    "kafa dağıtmak":  {"kahkaha": 0.7, "battaniye": 0.5},
    "dizi gibi film": {"adrenalin": 0.6, "gece": 0.4},
    "akıcı film":     {"adrenalin": 0.6, "sipsak": 0.4},
    "sarmayan":       {"kalp": -0.5, "sessiz": -0.3},
    "sarıyor":        {"battaniye": 0.6, "kalp": 0.4},
    "vibe":           {"gece": 0.5, "sessiz": 0.4, "kahkaha": 0.3},
    "vibes":          {"gece": 0.5, "sessiz": 0.4, "kahkaha": 0.3},
    "good vibes":     {"kahkaha": 0.7, "battaniye": 0.5},
    "dark vibes":     {"gece": 0.8, "deep-chills": 0.5},
    "aesthetic":      {"kadraj-estetigi": 0.8, "sessiz": 0.4},
    "çerezlik":       {"sipsak": 0.7, "kahkaha": 0.5},
    "izlemesi keyifli": {"battaniye": 0.7, "kahkaha": 0.4},
    "psikolojik çöküş": {"zihin": 0.9, "deep-chills": 0.6},
}

GENRE_KEYWORDS = {
    "komedi": [35], "dram": [18], "drama": [18], "aksiyon": [28],
    "korku": [27], "gerilim": [53], "thriller": [53],
    "romantik": [10749], "bilim kurgu": [878], "sci-fi": [878],
    "fantastik": [14], "fantezi": [14], "macera": [12],
    "animasyon": [16], "belgesel": [99], "savaş": [10752],
    "western": [37], "kovboy": [37], "müzikal": [10402],
    "suç": [80], "gizem": [9648], "tarih": [36],
    "aile": [10751],
    # ── İngilizce tür adları (yabancı dil sorguları) ──
    # Not: "war"/"action" gibi kısa kelimeler (award, satisfaction içinde
    # substring olarak geçtiğinden) bilinçli olarak EKLENMEDİ; bunlar theme_router
    # (savas, kelime-sınırı) ve _RULE_MOOD_MAP (adrenalin) ile karşılanır.
    "comedy": [35], "horror": [27], "romance": [10749],
    "romantic": [10749], "adventure": [12], "mystery": [9648],
    "crime": [80], "documentary": [99],
    "animation": [16], "musical": [10402], "fantasy": [14],
    "science fiction": [878], "history": [36],
    "thriller": [53], "thrill": [53],
    "action movie": [28], "war movie": [10752],
    "romcom": [10749, 35], "rom-com": [10749, 35],
}

# Kelime-sınırı (word-boundary) regex'leri — "savaş" ∉ "yavaş" garantisi.
_GENRE_KW_RE: dict[str, re.Pattern] = {
    gw: re.compile(r"(?<!\w)" + re.escape(gw) + r"(?!\w)")
    for gw in GENRE_KEYWORDS
}


def _genre_kw_in(text: str, genre_word: str) -> bool:
    """Genre keyword'ü kelime sınırıyla text içinde ara."""
    return _GENRE_KW_RE[genre_word].search(text) is not None


def _genre_kw_pos(text: str, genre_word: str) -> int:
    """Genre keyword'ün text içindeki başlangıç pozisyonu (-1 = yok)."""
    m = _GENRE_KW_RE[genre_word].search(text)
    return m.start() if m else -1


NEGATIVE_WORDS = [
    "olmasın", "istemiyorum", "değil", "hariç", "dışında", "yok",
    "olmadan", "kaçının", "uzak", "ama", "fakat",
]

# İçerik bazlı reddetme: tür adı geçmeden "şiddet/kan/korkutma" gibi içerik
# kısıtları → ilgili türleri hariç tut. (phrase → exclude genre_ids)
_CONTENT_NEGATION = {
    # ── Şiddet / kan / vahşet ──
    "şiddet içermesin": [27, 53, 10752, 80], "şiddet olmasın": [27, 53, 10752, 80],
    "şiddetsiz": [27, 53, 10752, 80], "aşırı şiddet olmasın": [27, 53, 10752, 80],
    "şiddet yok": [27, 53, 10752, 80], "kavga olmasın": [28, 53],
    "kan olmasın": [27, 53], "kanlı olmasın": [27, 53], "kan revan olmasın": [27, 53],
    "gore olmasın": [27], "gore yok": [27], "vahşet olmasın": [27, 53, 80],
    "vahşi olmasın": [27, 53], "işkence olmasın": [27, 53],
    # ── Korku / gerilim / ürperti ──
    "korkutmasın": [27, 53], "ürkütmesin": [27, 53], "korkutucu olmasın": [27, 53],
    "korku olmasın": [27], "korku içermesin": [27], "ürkütücü olmasın": [27, 53],
    "gerilim olmasın": [53], "dehşet olmasın": [27], "tedirgin etmesin": [27, 53],
    "jump scare olmasın": [27], "korkutmayan": [27, 53], "ürkütmeyen": [27, 53],
    "korkutmaz": [27], "korkmadan": [27], "gerilimsiz": [53],
    # ── Rahatsız edici / iğrenç / tiksindirici ──
    "rahatsız edici olmasın": [27, 53], "rahatsız edici sahne olmasın": [27, 53],
    "rahatsız etmesin": [27, 53], "iğrenç olmasın": [27, 53], "iğrenç sahne olmasın": [27, 53],
    "tiksindirici olmasın": [27, 53], "mide bulandırıcı olmasın": [27, 53],
    "mide bulandırmasın": [27, 53], "tüyler ürpertici olmasın": [27, 53],
    "travmatik olmasın": [27, 53], "rahatsız edici içerik olmasın": [27, 53],
    # ── Cinsel / erotik / müstehcen içerik (güvenilir tür yok → mood guard ile;
    #    yine de tanınır ve pozitif "erotik/şehvet" boost'u bastırılır) ──
    "cinsel içerik olmasın": [], "cinsellik olmasın": [], "cinsel sahne olmasın": [],
    "cinsel içermesin": [], "şehvet olmasın": [], "şehvet içermesin": [],
    "erotik olmasın": [], "erotik içermesin": [], "erotizm olmasın": [],
    "müstehcen olmasın": [], "müstehcenlik olmasın": [], "çıplaklık olmasın": [],
    "çıplak sahne olmasın": [], "seks sahnesi olmasın": [], "sex sahnesi olmasın": [],
    "tecavüz olmasın": [], "tecavüz sahnesi olmasın": [], "taciz sahnesi olmasın": [],
    "yetişkin içeriği olmasın": [], "+18 olmasın": [], "18+ olmasın": [],
    # ── Madde / küfür / dil ──
    "uyuşturucu olmasın": [], "madde bağımlılığı olmasın": [],
    "küfür olmasın": [], "küfürlü olmasın": [], "argo olmasın": [],
    # ── Duygu/ton (tür değil, mood ile ele alınır) ──
    "ağlatmasın": [], "ağır olmasın": [], "kasvetli olmasın": [],
    "üzücü olmasın": [], "depresif olmasın": [], "karamsar olmasın": [],
    "deprese etmesin": [], "ağır bir şey olmasın": [],
}

# Türkçe dil/ülke adları → ISO 639-1 kodları
LANGUAGE_KEYWORDS = {
    "türk filmi": "tr", "türkçe": "tr", "yerli": "tr",
    "japon filmi": "ja", "japonca": "ja", "japon yapımı": "ja",
    "kore filmi": "ko", "korece": "ko", "kore yapımı": "ko",
    "fransız filmi": "fr", "fransızca": "fr",
    "italyan filmi": "it", "italyanca": "it",
    "alman filmi": "de", "almanca": "de",
    "ispanyol filmi": "es", "ispanyolca": "es",
    "amerikan filmi": "en", "ingiliz filmi": "en",
    "ingilizce": "en",
}

# Çocuk/aile-güvenli (yaş-uygun) içerik tespiti — bu sorgularda korku/gerilim/
# şiddet/savaş/suç TÜRLERİ hariç tutulur, aile+animasyon türleri öne çıkar.
_CHILD_SAFE_GENRES = [10751, 16]          # Aile, Animasyon
_CHILD_EXCLUDE_GENRES = [27, 53, 80, 10752, 10749]  # Korku, Gerilim, Suç, Savaş, Romantik(yetişkin)
_CHILD_SAFE_CUES = (
    "cocuk icin", "cocuga uygun", "cocuga gore", "cocukla izle", "cocukla beraber",
    "cocuklarla", "cocuklar icin", "cocuklara uygun", "cocuk filmi", "cocuk filmleri",
    "cocugum icin", "cocuguma", "cocuguma uygun", "minik icin", "ufaklik icin",
    "cocugumla", "cocugumun", "cocuguyla", "cocuklarimla", "cocuk icin uygun",
    "aile dostu", "aileyle izle", "ailece izle", "ailecek", "aile filmi", "tum aile",
    "butun aile", "yas uygun", "yasa uygun", "yas dostu", " cocuk ", "ailecek izle",
)

# Yetişkin/yaş sınırı ipuçları — kesin certification filtresi (TMDB) yok; en azından
# anlamsız exact-search'e düşmesin, genel mood önerisine yönlensin.
_AGE_ADULT_CUES = (
    "yetiskin", "yetiskinlere", "yetiskinler icin", "18 yas", "+18", "18 +", "18+",
    "yas ustu", "yas uzeri", "ergen", "olgun izleyici", "yas siniri",
)


_LIST_LIMIT_RE = re.compile(r"\b(?:top|ilk|en\s+iyi|en\s+guzel|en\s+sevilen|en\s+populer)\s*(\d{1,2})\b")
_LIST_COUNT_RE = re.compile(r"\b(\d{1,2})\s*(?:film|tane|adet|oneri|yapim|movie|movies)\b")
_RATING_KW_RE = re.compile(r"\b(?:imdb|rating|puani|puan)\s*(\d{1,2}(?:[.,]\d)?)")
_RATING_SUFFIX_RE = re.compile(r"\b(\d{1,2}(?:[.,]\d)?)\s*(?:ustu|uzeri|\+|ve\s+ustu|ve\s+uzeri)")
_HIGH_RATED_CUES = ("en yuksek puan", "en iyi puan", "en kaliteli", "yuksek puanli",
                    "kaliteli film", "en cok begenilen", "basyapit")


def parse_list_controls(text: str) -> dict:
    """'top 10', 'en iyi 5', '3 film öner', 'imdb 8 üstü', 'en yüksek puanlı'
    → {limit, min_vote, high_rated} (yoksa None). Sıfır-API, regex."""
    t = _fold_keep(text)  # ondalık (8.5) ve noktalama korunur, TR aksanı katlanır
    out = {"limit": None, "min_vote": None, "high_rated": False}
    # Limit / adet
    m = _LIST_LIMIT_RE.search(t) or _LIST_COUNT_RE.search(t)
    if m:
        try:
            n = int(m.group(1))
            if 1 <= n <= 50:
                out["limit"] = n
        except ValueError:
            pass
    # Puan eşiği (imdb 8 / 8 üstü) — yalnızca 1-10 aralığı geçerli
    rm = _RATING_KW_RE.search(t) or _RATING_SUFFIX_RE.search(t)
    if rm:
        try:
            v = float(rm.group(1).replace(",", "."))
            if 1.0 <= v <= 10.0:
                out["min_vote"] = v
        except ValueError:
            pass
    if any(cue in t for cue in _HIGH_RATED_CUES):
        out["high_rated"] = True
    return out


def _detect_age_query(text: str) -> bool:
    """Yaş/yetişkin sınırı ifadesi mi? (çocuk-güvenli DEĞİL; genel öneriye yönlenir)"""
    t = f" {_fold(text)} "
    return any(cue in t for cue in _AGE_ADULT_CUES)


def _detect_child_safe(text: str) -> bool:
    """Sorgu çocuk/aile-güvenli içerik mi istiyor? (folded, kelime-grubu bazlı)"""
    t = f" {_fold(text)} "
    return any(cue in t for cue in _CHILD_SAFE_CUES)

# Kelime-sınırı bazlı dil/ulus tespiti (folded). Bare sıfatlar ("kore korku",
# "japon animasyon") da yakalanır; substring tuzakları (salman→de, virüs→ru)
# \b sınırıyla önlenir. Form listesi → ISO kodu.
_LANG_FORMS = {
    "tr": ["turk", "turkce", "yerli", "yesilcam", "turkiye", "turkish"],
    "ja": ["japon", "japonca", "japonya", "japanese"],
    "ko": ["kore", "koreli", "korece", "guney kore", "korean"],
    "fr": ["fransiz", "fransizca", "fransa", "french"],
    "it": ["italyan", "italyanca", "italya", "italian"],
    "de": ["alman", "almanca", "almanya", "german"],
    "es": ["ispanyol", "ispanyolca", "ispanya", "spanish"],
    "en": ["amerikan", "ingiliz", "ingilizce", "hollywood", "britanya", "british", "american"],
    "ru": ["rus", "rusca", "rusya", "sovyet", "russian", "soviet"],
    "hi": ["hint", "hintli", "hindistan", "bollywood", "indian"],
    "zh": ["cin", "cinli", "cince", "chinese"],
    "sv": ["isvec", "isvecli", "swedish"],
    "fa": ["iran", "iranli", "farsca", "fars", "iranian", "persian"],
}
# Daha uzun (spesifik) formlar önce → "guney kore" "kore"den önce denenir.
_LANG_PATTERNS = sorted(
    ((re.compile(r"\b" + re.escape(form) + r"\b"), code)
     for code, forms in _LANG_FORMS.items() for form in forms),
    key=lambda x: -len(x[0].pattern),
)

# "ama/fakat" ile ayrılmış karmaşık cümlelerde negation tespiti
_CLAUSE_SPLITTER = re.compile(r"\b(?:ama|fakat|ancak|lakin|yalnız)\b", re.IGNORECASE)


def _normalize(text: str) -> str:
    if not text:
        return ""
    t = text.strip().lower()
    t = t.replace(chr(0x0307), "")
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _fuzzy_match(s1: str, s2: str) -> float:
    return SequenceMatcher(None, _normalize(s1), _normalize(s2)).ratio()


_TR_FOLD = str.maketrans("çğıöşü", "cgiosu")


def _fold(text: str) -> str:
    """Türkçe aksanları katlayıp normalize eder (hem aksanlı hem ASCII girişi yakalar).
    'İ'.lower() = 'i̇' (U+0307 combining dot) sorununu da temizler."""
    return _normalize(text).translate(_TR_FOLD).replace(chr(0x0307), "")


def _title_key(text: str) -> str:
    """Film başlığı eşleştirme anahtarı — yerel başlık indeksi ile resolver AYNI
    anahtarı kullanmalı. _fold'a ek olarak Türkçe 'İ'.lower() = 'i̇' birleşik
    noktasını (U+0307) temizler → 'İstanbul'/'istanbul' tutarlı eşleşir."""
    return _fold(text).replace(chr(0x0307), "").strip()


# Türkçe sondan eklemeli yapı için hafif, kural-tabanlı suffix-stripper.
# En uzun ekten kısaya doğru tek tur soyar; gövde >= 3 harf kalmalı (aşırı soymayı önler).
# Aksan-katlanmış (folded) girdi bekler.
_TR_SUFFIXES = (
    "lerini", "larini", "lerinde", "larinda", "leriyle", "lariyla",
    "lerin", "larin", "leri", "lari", "ler", "lar",
    "iyorum", "iyoruz", "iyor", "ecek", "acak", "mis", "mus",
    "tir", "dir", "tur", "dur",
    "siz", "suz", "lik", "luk", "li", "lu",
    "nin", "nun", "den", "dan", "ten", "tan", "nde", "nda",
    "ti", "tu", "di", "du",
    "de", "da", "te", "ta", "yi", "yu", "ye", "ya",
    "in", "un", "im", "um", "i", "u", "e", "a",
)


def _tr_stem(word: str) -> str:
    """Tek tur, muhafazakâr Türkçe gövde çıkarımı (folded girdi)."""
    for suf in _TR_SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            return word[: -len(suf)]
    return word


# MOOD_KEYWORDS'ün tek-kelimelik girdilerinin gövde kümesi (önceden hesaplanır).
_MOOD_KEYWORD_STEMS = {
    _tr_stem(_fold(kw)) for kw in MOOD_KEYWORDS if " " not in kw
}


def _has_mood_words(text: str) -> bool:
    """Kelime bazlı mood kontrolü — Türkçe ekleri köke indirip eşleştirir."""
    t = _normalize(text)
    words = set(t.split())
    # 1) Hızlı tam-kelime yolu (mevcut davranış korunur)
    for kw in MOOD_KEYWORDS:
        if kw in words:
            return True
    # 2) Morfolojik yol: sorgu kelimelerinin gövdesi keyword gövdesiyle eşleşiyor mu
    for w in words:
        if _tr_stem(_fold(w)) in _MOOD_KEYWORD_STEMS:
            return True
    return False


# Kavramsal/betimleyici ifade işaretçileri — bunlar varsa metin film BAŞLIĞI değil,
# bir tema/konu tarifidir; exact_movie_search yerine semantic/mood'a yönlendirilmeli.
# Not: "ve"/"ile" bilinçli olarak DIŞARIDA — gerçek başlıkları bozar ("Babam ve Oğlum").
_CONCEPT_MARKERS = {"arasinda", "hakkinda", "dair", "uzerine", "karsi", "ozelinde"}
_CONCEPT_BIGRAMS = ("yapay zeka", "zaman yolculugu", "paralel evren")


def _looks_conceptual(text: str) -> bool:
    """Betimleyici tema sorgusu mu? (film başlığı yerine konu tarifi)"""
    t = _fold(text)
    words = set(t.split())
    if words & _CONCEPT_MARKERS:
        return True
    for bg in _CONCEPT_BIGRAMS:
        if bg in t:
            return True
    return False


def _is_short_title_like(text: str) -> bool:
    words = text.strip().split()
    if not (1 <= len(words) <= 5):
        return False
    if _has_mood_words(text):
        return False
    if _looks_conceptual(text):
        return False
    # Tür kelimesi içeren kısa ifadeler ("a horror movie", "romantik film")
    # film başlığı değil, tür isteğidir → genre_recommendation'a düşsün.
    text_lower = text.lower()
    if any(_genre_kw_in(text_lower, gw) for gw in GENRE_KEYWORDS):
        return False
    return True


# KNOWN_PERSONS'ın normalize edilmiş (aksansız, noktalamasız) sürümü — çok kelimeli
# ve tireli isimlerin (örn. "park chan-wook", "kore-eda") karşılaştırmasını sağlar.
_KNOWN_PERSONS_NORM = {_normalize(p) for p in KNOWN_PERSONS}


# Kişi adı OLAMAYACAK kelimeler — bunları içeren ifadeler isim sayılmaz.
# (Bağlaç, edat, zamir, betimleyici isim/sıfat ve İngilizce film terimleri.)
_NON_NAME_WORDS = {
    # İngilizce film terimleri + edatlar
    "film", "films", "movie", "movies", "winning", "best", "good", "great",
    "gems", "underrated", "vibes", "of", "the", "an", "to", "in", "on",
    "with", "and", "or", "my", "me", "something", "coming", "age",
    # Türkçe bağlaç / edat / zamir / nicelik
    "bir", "bu", "şu", "ve", "ile", "ama", "fakat", "ancak", "ya", "ki",
    "çok", "daha", "en", "gibi", "için", "kadar", "her", "hiç", "az", "biraz",
    "sonra", "sonrası", "önce", "öncesi", "olan", "olduğu", "kalmış", "bilinen",
    # Betimleyici isim / sıfat (kişi adı değil)
    "şey", "şeyler", "dizi", "diziler", "hikaye", "hikayesi", "hikayeler",
    "öykü", "öyküsü", "dünya", "dünyası", "evren", "evreni", "karakter",
    "karakteri", "ilişki", "ilişkisi", "akşam", "akşamı", "gece", "gecesi",
    "sabah", "adam", "adamın", "adamı", "kadın", "kadının", "çocuk", "çocukla",
    "çocuğu", "aile", "ailesi", "dönem", "dönemi", "sinema", "sineması",
    "yıl", "yılın", "yılı", "tarz", "tarzı", "güçlü", "yaşlı", "genç", "dahi",
    "deli", "modern", "klasik", "eski", "yeni", "veren", "alacak", "yapan", "eden",
    # Soru / seçim kelimeleri (kişi adı değil)
    "hangi", "hangisi", "hangisini", "hangimiz", "ne", "neyi", "nasıl", "kim",
    "kimi", "kimin", "nerede", "neden", "niye", "kaç", "öner", "önersene",
    "tavsiye", "izlesem", "izleyeyim", "bakayım", "seçsem",
    # Yaş / içerik / uygunluk betimleyicileri (kişi adı değil)
    "özel", "uygun", "yetişkin", "yetişkinler", "yetişkinlere", "yetişkinlik",
    "çocuklar", "çocuklara", "çocuğumla", "çocuğa", "yaş", "yaşa", "yaşında",
    "üstü", "altı", "izleyebileceğim", "izlenebilir", "seyredilebilir",
    # Betimleyici ifadeler — kişi adı değil
    "gerçek", "esinlenen", "uyarlanan", "geçen", "olan",
    "slow", "burn", "psychological", "mind", "bending",
    "dark", "light", "fast", "based", "true", "real", "events",
    "twist", "ending", "single", "location", "adapted",
    "book", "novel", "story",
    # "X filmi/filmleri" bare ifadesinde takı (PERSON_KEYWORD yolu zaten önce
    # çalışır; bu yalnız bare _looks_like_person_name yolunu korur)
    "filmi", "filmler", "filmleri", "filmini", "filmleriyle", "filmiyle",
}

# Türkçe fiil/ek sonları — kişi adları (neredeyse) hiç bu eklerle bitmez.
# "maz/mez" (Yılmaz), "sin/sın" (Muhsin) bilinçli DIŞARIDA — gerçek soyadlarını bozar.
_NAME_VERB_SUFFIXES = (
    "yorum", "yoruz", "iyor", "ıyor", "uyor", "üyor",
    "dım", "dim", "dum", "düm", "tım", "tim", "tüm", "tum",
    "mak", "mek", "ecek", "acak", "yacak", "yecek",
    "miş", "muş", "mış", "müş", "ması", "mesi",
    "makta", "mekte", "malı", "meli", "masin", "mesin",
    # Dilek/istek/yeterlilik kipleri ("izlesem", "bakayım", "izleyebileceğim")
    "sem", "sam", "eyim", "ayim", "ayım", "elim", "alim", "alım",
    "ebilir", "abilir", "ebilecek", "abilecek", "egim", "agim",
    "ecegim", "acagim", "eceğim", "acağım", "ebileceğim", "abileceğim",
    # Sıfat-fiil ekleri ("esinlenen", "uyarlanan", "geçen")
    "lenen", "lanan", "layan", "leyen",
    "enen", "anan", "ayan", "eyen",
    "olan", "olen",
    # Hal ekleri — kişi adları bunlarla bitmez ("olaylardan", "hikayeden")
    "lardan", "lerden", "lardan", "lerden",
    "larda", "lerde", "larin", "lerin",
    "larindan", "lerinden",
)


def _is_name_token(w: str) -> bool:
    """İsim parçası mı? Harf + tire/kesme işareti kabul (joon-ho, kar-wai, o'brien)."""
    if not (2 <= len(w) <= 15):
        return False
    return all(ch.isalpha() or ch in "-'" for ch in w)


def _is_plausible_person_name(name: str, allow_single: bool = False) -> bool:
    """
    Verilen metin gerçekten bir kişi adı gibi mi? Betimleyici cümleleri eler.
    - KNOWN_PERSONS'taki adları daima kabul.
    - Olumsuzluk, ruh hali, tür kelimesi, durak kelime, fiil eki içermesin.
    - Kelime sayısı: KNOWN dışında 2-3 (allow_single=True ise 1-3).
    Örnekler (kabul): "Tom Hanks", "Nuri Bilge Ceylan", "Bong Joon-ho", "Tarantino".
    Örnekler (red): "içim daralıyor", "güçlü kadın karakter", "dahi ama deli".
    """
    name = name.strip().strip('"\'')
    if not name:
        return False
    if _normalize(name) in _KNOWN_PERSONS_NORM:
        return True
    words = name.split()
    lo = 1 if allow_single else 2
    if not (lo <= len(words) <= 3):
        return False
    nl = name.lower()
    if _has_mood_words(name):
        return False
    if any(nw in nl for nw in NEGATIVE_WORDS):
        return False
    for gw in GENRE_KEYWORDS:
        if _genre_kw_in(nl, gw):
            return False
    # Tek kelimelik aday bir tür adının TYPO'su ise kişi DEĞİL ("korko"→korku,
    # "komeedi"→komedi). KNOWN_PERSONS dışındaki tek kelimeler için fuzzy kontrol;
    # gerçek tek-kelime soyadları (DiCaprio, Pitt) türlere benzemediği için korunur.
    if len(words) == 1 and len(nl) >= 4:
        nf = _fold(nl)
        for gw in GENRE_KEYWORDS:
            gwf = _fold(gw)
            if " " in gwf or len(gwf) < 4:
                continue
            if SequenceMatcher(None, nf, gwf).ratio() >= 0.80:
                return False
    for w in words:
        wl = w.lower()
        wf = _fold(wl)
        if wl in _NON_NAME_WORDS or wf in _NON_NAME_WORDS:
            return False
        if not _is_name_token(w):
            return False
        if len(wf) >= 6 and any(wf.endswith(s) for s in _NAME_VERB_SUFFIXES):
            return False
    return True


def _looks_like_person_name(text: str) -> bool:
    """Bare metin kişi adı mı? (PERSON_KEYWORD bağlamı olmadan — tek kelime yalnız KNOWN.)"""
    return _is_plausible_person_name(text, allow_single=False)


def _fold_keep(s: str) -> str:
    """Aksan-katlama + lowercase, UZUNLUĞU korur (indeks hizalaması için)."""
    return s.lower().translate(_TR_FOLD)


# ═══════════════════════════════════════════════════════════════
# FUZZY TÜR / KİŞİ TYPO DÜZELTİCİ
# ═══════════════════════════════════════════════════════════════
# detect_intent'ten ÖNCE çalışır; "komeedi"→"komedi", "nollan"→"nolan" gibi
# typo'ları düzeltir. Yalnız yeterince uzun (≥4 harf) kelimelere bakar.

# Tek-kelime genre adları (fold edilmiş) → orijinal genre adı
_GENRE_SINGLES_FOLDED: dict[str, str] = {}
for _gn in GENRE_KEYWORDS:
    _gnf = _fold(_gn)
    if " " not in _gnf and len(_gnf) >= 4:
        _GENRE_SINGLES_FOLDED[_gnf] = _gn

# KNOWN_PERSONS tek-kelime girişleri (fold edilmiş) → orijinal
_PERSON_SINGLES_FOLDED: dict[str, str] = {}
for _p in KNOWN_PERSONS:
    _pf = _fold(_p)
    if " " not in _pf and len(_pf) >= 4:
        _PERSON_SINGLES_FOLDED[_pf] = _p

# Çok-kelimeli KNOWN_PERSONS (fold edilmiş) → orijinal
_PERSON_MULTI_FOLDED: dict[str, str] = {}
for _p in KNOWN_PERSONS:
    _pf = _fold(_p)
    if " " in _pf:
        _PERSON_MULTI_FOLDED[_pf] = _p


# Fonetik / yaygın typo → doğru tür adı (fuzzy'nin yakalayamadığı durumlar)
_GENRE_TYPO_DIRECT: dict[str, str] = {
    "siyfi": "sci-fi", "sayfi": "sci-fi", "scifi": "sci-fi",
    "sifi": "sci-fi", "bilimkurgu": "bilim kurgu",
    "korko": "korku", "horor": "korku",
    "triller": "thriller", "triler": "thriller",
    "romcom": "komedi",  # already in GENRE_KEYWORDS but as separate entry
    "komdei": "komedi", "koemdi": "komedi",
    "macrea": "macera", "maecra": "macera",
    "drma": "dram", "daram": "dram",
    "animasyn": "animasyon", "animayon": "animasyon",
    "belgesle": "belgesel", "belgsle": "belgesel",
    "westrn": "western", "westn": "western",
}


def _fuzzy_correct_genre(word_folded: str) -> str | None:
    """Tek kelime (fold edilmiş) bir tür adının typo'su mu? ≥0.80 eşik.
    Önce direkt typo haritasına bakar, sonra fuzzy dener.
    Dönüş: düzeltilmiş tür adı veya None."""
    if word_folded in _GENRE_SINGLES_FOLDED:
        return None  # zaten exact match, düzeltme yok
    # Direkt typo haritası
    if word_folded in _GENRE_TYPO_DIRECT:
        return _GENRE_TYPO_DIRECT[word_folded]
    # Fuzzy eşleştirme
    best, best_r = None, 0.0
    for gf, gname in _GENRE_SINGLES_FOLDED.items():
        r = SequenceMatcher(None, word_folded, gf).ratio()
        if r >= 0.80 and r > best_r:
            best, best_r = gname, r
    return best


# Yaygın kişi adı typo'ları (fuzzy'nin kaçırabileceği)
_PERSON_TYPO_DIRECT: dict[str, str] = {
    "noland": "nolan", "nollan": "nolan",
    "taratino": "tarantino", "tarentino": "tarantino", "tarintino": "tarantino",
    "scorscese": "scorsese", "scorcese": "scorsese", "skorsese": "scorsese",
    "spielberk": "spielberg", "spilberg": "spielberg",
    "kubrik": "kubrick",
    "hiccock": "hitchcock", "hickok": "hitchcock",
    "dikabrio": "dicaprio", "dicapro": "dicaprio",
    "vilnov": "villeneuve", "vilnev": "villeneuve",
    "vilnove": "villeneuve", "vileneuve": "villeneuve",
    "fincir": "fincher",
}


def _fuzzy_correct_person(word_folded: str) -> str | None:
    """Tek kelime (fold edilmiş) bir bilinen kişi adının typo'su mu? ≥0.80 eşik.
    Önce direkt typo haritasına bakar, sonra fuzzy dener.
    Dönüş: düzeltilmiş kişi adı veya None."""
    if word_folded in _PERSON_SINGLES_FOLDED:
        return None  # zaten exact match
    # Direkt typo haritası
    if word_folded in _PERSON_TYPO_DIRECT:
        return _PERSON_TYPO_DIRECT[word_folded]
    # Fuzzy eşleştirme
    best, best_r = None, 0.0
    for pf, pname in _PERSON_SINGLES_FOLDED.items():
        r = SequenceMatcher(None, word_folded, pf).ratio()
        if r >= 0.80 and r > best_r:
            best, best_r = pname, r
    return best


# Fuzzy düzeltmeden muaf kelimeler — sıradan Türkçe/İngilizce kelimeler
# bir kişi/tür adına yanlışlıkla düzeltilmesin.
_FUZZY_STOP_WORDS = _NON_NAME_WORDS | {
    "adam", "kadın", "benim", "senin", "onun", "seni", "beni", "onu",
    "neler", "neden", "bence", "sence", "biraz", "bayağı", "böyle", "şöyle",
    "ilginç", "garip", "güzel", "hoş", "sıkıcı", "harika", "mükemmel",
    "tamam", "evet", "hayır", "olsun", "olabilir", "öner", "önerir",
    "izle", "seyret", "baksam", "izledim", "gördüm", "film", "filmi",
    "filmleri", "filmler", "dizisi", "dizi", "serisi", "seri",
    "sahne", "sahip", "senaryo", "müzik", "oyuncu",
    "yavaş", "hızlı", "uzun", "kısa", "büyük", "küçük", "kalın", "ince",
    "soğuk", "sıcak", "sessiz", "gürültülü", "temiz", "kirli",
    "tempolu", "tempoya", "tempo",
}
_FUZZY_STOP_FOLDED = {_fold(w) for w in _FUZZY_STOP_WORDS}


def _fuzzy_preprocess(text: str) -> str:
    """Metin ön-işleme: tür ve kişi typo'larını düzeltir.
    Örn: 'komeedi film' → 'komedi film', 'nollan filmi' → 'nolan filmi',
         'siyfi filmi' → 'sci-fi filmi', 'gerilm öner' → 'gerilim öner'."""
    words = text.lower().split()
    corrected = list(words)
    changed = False

    for i, w in enumerate(words):
        wf = _fold(w)
        if len(wf) < 4:
            continue
        # Stop-word → atla (sıradan kelimeler düzeltilmesin)
        if wf in _FUZZY_STOP_FOLDED:
            continue
        # Exact genre/person match → atla (düzeltme gereksiz)
        if wf in _GENRE_SINGLES_FOLDED or wf in _PERSON_SINGLES_FOLDED:
            continue
        # Tür typo'su dene
        gc = _fuzzy_correct_genre(wf)
        if gc:
            corrected[i] = gc
            changed = True
            logger.debug("Fuzzy genre correction: '%s' → '%s'", w, gc)
            continue
        # Kişi typo'su dene
        pc = _fuzzy_correct_person(wf)
        if pc:
            corrected[i] = pc
            changed = True
            logger.debug("Fuzzy person correction: '%s' → '%s'", w, pc)
            continue

    # Çok-kelimeli kişi adı typo'ları (bigram): "del taro" → "del toro"
    if len(words) >= 2:
        for i in range(len(words) - 1):
            bigram_f = _fold(words[i]) + " " + _fold(words[i + 1])
            if bigram_f in _PERSON_MULTI_FOLDED:
                continue  # exact match
            best_mp, best_r = None, 0.0
            for mpf, mpname in _PERSON_MULTI_FOLDED.items():
                r = SequenceMatcher(None, bigram_f, mpf).ratio()
                if r >= 0.80 and r > best_r:
                    best_mp, best_r = mpname, r
            if best_mp:
                parts = best_mp.split()
                corrected[i] = parts[0]
                corrected[i + 1] = parts[1] if len(parts) > 1 else corrected[i + 1]
                changed = True
                logger.debug("Fuzzy person bigram correction: '%s %s' → '%s'",
                             words[i], words[i + 1], best_mp)

    return " ".join(corrected) if changed else text


# ═══════════════════════════════════════════════════════════════
# ARGO / KISALTMA NORMALİZER
# ═══════════════════════════════════════════════════════════════
# Türkçe internet argosunu / kısaltmalarını standart forma çevirir.
# detect_intent'ten ÖNCE çalışır → downstream kurallar temiz metin görür.
# Kelime sınırı (\b) kullanılır: "bi" → "bir" ama "bilim" dokunulmaz.

# Sözlük: kısaltma/argo → standart form
# Sıralama önemli: uzun ifadeler önce (çoklu kelime ifadeleri word-level'dan önce)
_SLANG_PHRASES: list[tuple[str, str]] = [
    # Çoklu-kelime ifadeler (phrase-level replacement, regex ile)
    ("bi tane", "bir tane"),
    ("bi film", "bir film"),
    ("bi tık", "biraz"),
    ("bi kaç", "birkaç"),
    ("baya iyi", "bayağı iyi"),
    ("baya güzel", "bayağı güzel"),
    ("fln fşt", "falan fiştan"),
    ("fln fln", "falan falan"),
]

# Tek kelime eşleşmeleri — word boundary ile
_SLANG_WORDS: dict[str, str] = {
    # Kısaltmalar
    "knk": "arkadaş",
    "krdş": "kardeş",
    "krdsm": "kardeşim",
    "kanka": "arkadaş",
    "bi": "bir",
    "bişi": "bir şey",
    "bişey": "bir şey",
    "bisi": "bir şey",
    "fln": "falan",
    "falan": "falan",  # keep as is (already standard)
    "fşt": "fiştan",
    "slm": "selam",
    "nbr": "ne haber",
    "tmm": "tamam",
    "tşk": "teşekkür",
    # Yoğunlaştırıcılar / argo sıfatlar
    "baya": "bayağı",
    "bayaa": "bayağı",
    "aşşırı": "aşırı",
    "cok": "çok",       # Türkçe ç olmadan yazılmış
    "coook": "çok",
    "cooook": "çok",
    "çoook": "çok",
    "çooook": "çok",
    "müq": "mükemmel",
    "muq": "mükemmel",
    "mq": "mükemmel",
    # Film/istek argo
    "izliyim": "izleyeyim",
    "izlim": "izleyeyim",
    "baksam": "izlesem",
    "bakim": "izleyeyim",
    "bakıyım": "izleyeyim",
    "atsana": "öner",
    "at": "öner",        # "film at" → "film öner"
    "atsaniza": "önerir misiniz",
    "sölesene": "söylesene",
    "sölesen": "söylesen",
    # Duygu / betimleyici argo
    "efsane": "harika",
    "süper": "harika",
    "sarar": "iyi",
    "sarıyo": "iyi",
    "sarmıyo": "sıkıcı",
    "bomba": "harika",
}

# Ön-derlenmiş regex'ler (performans)
_SLANG_PHRASE_RES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE), repl)
    for phrase, repl in _SLANG_PHRASES
]
_SLANG_WORD_RES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b" + re.escape(word) + r"\b", re.IGNORECASE), repl)
    for word, repl in _SLANG_WORDS.items()
    if word != repl  # skip identity mappings
]


def _normalize_slang(text: str) -> str:
    """Argo/kısaltma normalizer. Kelime sınırı bazlı, güvenli.
    'knk film at' → 'arkadaş film öner'
    'baya iyi bi film' → 'bayağı iyi bir film'
    'fln film sölesene' → 'falan film söylesene'"""
    result = text
    # Önce çoklu-kelime ifadeleri
    for pat, repl in _SLANG_PHRASE_RES:
        result = pat.sub(repl, result)
    # Sonra tek-kelime
    for pat, repl in _SLANG_WORD_RES:
        result = pat.sub(repl, result)
    return result


# "İsim + tür/dönem" ifadesinde isimden sonra gelen kısıt-tetikleyiciler
_PERSON_SPLIT_FILLERS = (
    "filmi", "filmleri", "filmlerini", "filmini", "yapimi", "yapimlari",
    "tarzi", "gibi", "klasigi", "klasikleri",
)
_YEAR_DECADE_RE = re.compile(r"\b(?:19|20)\d{2}\b|\b\d{2,4}\s*(?:lar|ler)\b|\bsonrasi\b|\boncesi\b")


def _extract_leading_person(text: str):
    """'Nolan bilim kurgu' / 'Tom Hanks komedi' / 'Tarantino 90lar suç' →
    (isim, 'director'|'actor') veya (None, None). İsimden SONRA tür/dil/dönem/
    filler kısıtı gelen kalıpları yakalar (PERSON_KEYWORD bağlamı olmadan)."""
    if not text or len(text.strip()) < 3:
        return None, None
    folded = _fold_keep(text)
    cut = len(folded)
    # En erken kısıt-tetikleyici konumu (kelime-sınırı bazlı) → öncesi aday isim
    triggers = [_fold_keep(gw) for gw in GENRE_KEYWORDS]
    triggers += [form for forms in _LANG_FORMS.values() for form in forms]
    triggers += list(_PERSON_SPLIT_FILLERS)
    for trig in triggers:
        m = re.search(r"\b" + re.escape(trig), folded)
        if m and m.start() > 0:
            cut = min(cut, m.start())
    my = _YEAR_DECADE_RE.search(folded)
    if my and my.start() > 0:
        cut = min(cut, my.start())
    if cut >= len(folded):
        return None, None
    candidate = text[:cut].strip().strip('"\'').rstrip(",.")
    if len(candidate) < 2:
        return None, None
    # Aday salt ulus/dil sıfatıysa kişi DEĞİL ("japon animasyon"→"japon" reddi)
    if _normalize(candidate) not in _KNOWN_PERSONS_NORM and _detect_lang_filter(candidate):
        return None, None
    # Aday çok-kelimeli ve TANINMIŞ değilse, bilinen-kişi önekine kırp
    # ("Scorsese gangster" → "Scorsese"); aksi halde tam adayı dene.
    if _normalize(candidate) not in _KNOWN_PERSONS_NORM:
        words = candidate.split()
        for n in range(len(words), 0, -1):
            pref = " ".join(words[:n])
            if _normalize(pref) in _KNOWN_PERSONS_NORM:
                return pref, "director"
    if not _is_plausible_person_name(candidate, allow_single=True):
        return None, None
    ptype = "director" if _normalize(candidate) in _KNOWN_PERSONS_NORM else "actor"
    return candidate, ptype


def _find_known_person_in(text: str):
    """Metin içinde KNOWN_PERSONS'u ara (normalize eşleşme).
    Çok-kelimeli eşleşmeler öncelikli. Döndürür: (isim, 'director'|'actor') | (None, None)."""
    tn = _normalize(text)
    best = None
    best_len = 0
    for pn in _KNOWN_PERSONS_NORM:
        if len(pn) > best_len and pn in tn:
            if re.search(r"(?<!\w)" + re.escape(pn) + r"(?!\w)", tn):
                best = pn
                best_len = len(pn)
    if not best:
        return None, None
    for p in KNOWN_PERSONS:
        if _normalize(p) == best:
            return p, "actor"
    return None, None


# "A ve B birlikte / aynı filmde" — iki oyuncunun ortak filmi
_MULTI_PERSON_SPLIT = re.compile(r"\s+(?:ve|ile|&|,)\s+", re.IGNORECASE)
_MULTI_PERSON_CUES = ("birlikte", "beraber", "ayni filmde", "aynı filmde", "bir arada",
                      "ortak film", "ikisi", "ikisinin", "birlikte oynad", "kadrosunda",
                      "filmi", "filmleri", "film")


def _detect_multi_person(text: str):
    """'Al Pacino ve De Niro birlikte' → (isim1, isim2) ya da (None, None).
    İki taraf da makul kişi adı olmalı + bir 'birlikte/aynı film' ipucu bulunmalı."""
    t = text.strip()
    tl = _fold(t)
    if not any(cue in tl for cue in (_fold(c) for c in _MULTI_PERSON_CUES)):
        return None, None
    # Ayraçtan ÖNCEKİ ipucu/takıları temizle, böl
    parts = _MULTI_PERSON_SPLIT.split(t, maxsplit=1)
    if len(parts) != 2:
        return None, None
    a = parts[0].strip().strip('"\'')
    b = parts[1].strip().strip('"\'')
    # İkinci taraftan trailing ipucu kelimelerini at ("... birlikte", "... filmi")
    for cue in ("birlikte oynadığı", "birlikte", "beraber", "aynı filmde", "ayni filmde",
                "bir arada", "ortak filmi", "ortak film", "filmleri", "filmi", "film",
                "ikisinin", "ikisi", "kadrosunda"):
        b = re.sub(r"\s*\b" + re.escape(cue) + r"\b\s*$", "", b, flags=re.IGNORECASE).strip()
    a = re.sub(r"^(?:hem)\s+", "", a, flags=re.IGNORECASE).strip()
    if len(a) < 2 or len(b) < 2:
        return None, None
    # İki taraf da kişi adı gibi olmalı (tür/mood/şey değil)
    if _is_plausible_person_name(a, allow_single=True) and _is_plausible_person_name(b, allow_single=True):
        # En az biri 2 kelimelik tam ad ya da KNOWN olsun (yanlış pozitifi azalt)
        strong = (len(a.split()) >= 2 or len(b.split()) >= 2
                  or _normalize(a) in _KNOWN_PERSONS_NORM or _normalize(b) in _KNOWN_PERSONS_NORM)
        if strong:
            return a, b
    return None, None


# ═══════════════════════════════════════════════════════════════
# INTENT RESULT
# ═══════════════════════════════════════════════════════════════
class Intent:
    def __init__(self, intent_type: str, **kwargs):
        self.type = intent_type
        self.reference_title = kwargs.get("reference_title", None)
        self.reference_title2 = kwargs.get("reference_title2", None)  # "X ile Y ortası"
        self.similar_modifier = kwargs.get("similar_modifier", None)  # "X gibi ama daha Y"
        self.person_name = kwargs.get("person_name", None)
        self.person_name2 = kwargs.get("person_name2", None)  # "A ve B birlikte"
        self.person_type = kwargs.get("person_type", None)
        self.feedback_type = kwargs.get("feedback_type", None)
        self.genres = kwargs.get("genres", [])
        self.exclude_genres = kwargs.get("exclude_genres", [])
        self.modifiers = kwargs.get("modifiers", {})
        self.original_text = kwargs.get("original_text", "")
        # ── Çoklu intent / cross-signal alanları ──
        self.era_constraint = kwargs.get("era_constraint", None)
        self.platform_filter = kwargs.get("platform_filter", None)
        self.mood_signals = kwargs.get("mood_signals", {})
        self.time_constraint = kwargs.get("time_constraint", None)
        self.lang_filter = kwargs.get("lang_filter", None)

    def to_dict(self):
        return {
            "type": self.type,
            "reference_title": self.reference_title,
            "person_name": self.person_name,
            "person_type": self.person_type,
            "feedback_type": self.feedback_type,
            "genres": self.genres,
            "exclude_genres": self.exclude_genres,
            "modifiers": self.modifiers,
            "era_constraint": self.era_constraint,
            "platform_filter": self.platform_filter,
            "mood_signals": self.mood_signals,
            "time_constraint": self.time_constraint,
            "lang_filter": self.lang_filter,
        }


# ═══════════════════════════════════════════════════════════════
# RULE-BASED MOOD ANALYSIS (local, zero API calls)
# ═══════════════════════════════════════════════════════════════
_MOOD_WEIGHTS = {
    "battaniye":    0.20, "yolculuk": 0.10, "gece": 0.15, "kahkaha": 0.10,
    "gozyasi":      0.10, "adrenalin": 0.10, "askbahcesi": 0.10, "zamanyolcusu": 0.10,
    "sessiz":       0.10, "zihin": 0.10, "kalp": 0.10, "karmakar": 0.10,
    "sipsak":       0.10, "deep-chills": 0.10,
    "kadraj-estetigi": 0.10, "geceyarisi-itirafi": 0.10,
}

_RULE_MOOD_MAP = {
    ("yorgun", "sakin", "rahatlamak", "battaniye", "sarılmak", "huzur", "dinlen",
     "tired", "relax", "cozy", "feel good", "feel-good", "comfort",
     "ısıtacak", "ısıtsın", "içimi ısıt", "huzur bul", "quiet", "sakin bir"):        "battaniye",
    ("macera", "yol", "keşif", "seyahat", "kaçış",
     "adventure", "journey", "road trip"):                                           "yolculuk",
    ("karanlık", "gece", "gizem", "korku", "gerilim", "kasvet", "loş",
     "dark", "noir", "crime", "mystery"):                                            "gece",
    ("gülmek", "komik", "eğlence", "kahkaha", "neşe", "güldür",
     "laugh", "funny", "comedy", "fun", "cheer me up",
     "kafayı yedim", "dağıt", "kafamı dağı", "sıkıl", "bunal", "sıkıntı"):           "kahkaha",
    ("ağlamak", "üzgün", "hüzün", "gözyaşı", "duygusal", "dokunaklı", "yürek",
     "sad", "cry", "emotional", "tearjerker", "feeling down",
     "melankoli", "umutsuz", "küstüm", "boşlukta", "ait olama", "yalnızlık",
     "özlem", "özledim", "içim daral", "içim karar", "buruk", "kırgın", "feels"):    "gozyasi",
    ("heyecan", "adrenalin", "patlama", "savaş", "aksiyon", "tempo",
     "action", "adrenaline", "thrill", "intense", "aklımı başımdan"):                "adrenalin",
    ("romantik", "aşk", "kalp", "sevgi", "tutku", "kelebek",
     "sevgilimle", "şehvetli", "erotik", "tutkulu",
     "romantic", "romance", "love story"):                                            "askbahcesi",
    ("nostalji", "eski", "çocukluk", "geçmiş", "retro", "vintage",
     "nostalgic", "classic"):                                                        "zamanyolcusu",
    ("düşünmek", "felsefe", "zihin", "entelektüel", "soru", "derin", "beyin",
     "yapay zeka", "felsefi", "mind bending", "twist", "thought provoking"):          "zihin",
    ("küçük", "kalp", "samimi", "içten", "basit", "sıcak",
     "indie", "intimate", "heartfelt"):                                              "kalp",
    ("deneysel", "sıradışı", "karmaşık", "garip", "absürt", "kült",
     "experimental", "surreal", "weird", "absurd"):                                  "karmakar",
    ("kisa", "kısa", "kompakt", "sipsak", "çekim", "short", "quick"):                "sipsak",
    ("atmosfer", "gerilim", "yavaş", "ürperti", "tedirgin", "kasvet",
     "horror", "scary", "creepy", "unsettling", "slow burn"):                        "deep-chills",
    ("estetik", "görsel", "sinematografi", "kompozisyon", "kadraj",
     "aesthetic", "cinematography", "visually"):                                     "kadraj-estetigi",
    ("itiraf", "konuşma", "diyalog", "sohbet", "samimi", "gece yarısı",
      "dialogue", "conversation"):                                                    "geceyarisi-itirafi",
    ("tarih", "tarihi film", "tarihsel", "tarihi dönem"):                             "zamanyolcusu",
    ("western", "kovboy", "vahşi batı", "cowboy"):                                     "zamanyolcusu",
    ("fantazi",):                                                                       "karmakar",
    ("gençlik", "teen", "gençlik filmi"):                                               "kahkaha",
    ("spor", "spor filmi", "sport"):                                                    "adrenalin",
    ("korku komedi", "korku komik", "horror comedy"):                                   "karmakar",
    ("sanat filmi", "arthouse"):                                                        "kadraj-estetigi",
    ("oscar", "ödüllü", "ödüllü film", "award winning"):                                "kalp",
    ("gişe rekoru", "blockbuster", "popüler film"):                                     "adrenalin",
}


def _parse_complex_negation(text: str) -> tuple[list[int], list[int]]:
    """"ama/fakat" ile bölünmüş cümlelerde ayrı ayrı tür include/exclude çıkar.
    İlk cümle ana istek, "ama" sonrası olumsuz türleri barındırır.
    Örn: "korku değil ama gerilim olabilir" → exclude=[27], include=[53]."""
    t = text.lower().strip()
    clauses = _CLAUSE_SPLITTER.split(t, maxsplit=1)
    main_clause = clauses[0].strip()
    # Önce tüm metinden exclude'ları topla
    _NEG_BEFORE = ("olmasın", "istemiyorum", "değil", "hariç", "dışında")
    _NEG_AFTER = ("hariç", "dışında", "olmasın", "istemiyorum", "değil")
    all_exclude = []
    for gname, gids in GENRE_KEYWORDS.items():
        pos = _genre_kw_pos(t, gname)
        if pos >= 0:
            before_text = t[max(0, pos - 30):pos]
            after_text = t[pos + len(gname):pos + len(gname) + 15]
            neg_b = any(nw in before_text for nw in _NEG_BEFORE)
            neg_a = any(nw in after_text for nw in _NEG_AFTER)
            if neg_b:
                intervening = any(
                    _genre_kw_pos(before_text, g2) >= 0
                    for g2 in GENRE_KEYWORDS if g2 != gname
                )
                if intervening:
                    neg_b = False
            if neg_b or neg_a:
                all_exclude.extend(gids)
    # "ama" sonrası varsa, oradaki türleri include'a ekle
    more_include = []
    if len(clauses) > 1:
        after = clauses[1].strip()
        for gname, gids in GENRE_KEYWORDS.items():
            pos = _genre_kw_pos(after, gname)
            if pos >= 0:
                after_before = after[max(0, pos - 15):pos]
                if not any(nw in after_before for nw in ("olmasın", "istemiyorum", "değil", "hariç")):
                    more_include.extend(gids)
    # Ana clause'taki türlerden exclude'ları çıkar
    # "korku değil gerilim" → "gerilim" öncesinde "değil" var ama arada "korku" genre'ı
    # bulunuyor: negatif kelime "korku"ya ait, "gerilim"e değil.
    main_include = []
    for gname, gids in GENRE_KEYWORDS.items():
        pos = _genre_kw_pos(main_clause, gname)
        if pos >= 0:
            before_text = main_clause[max(0, pos - 15):pos]
            after_text = main_clause[pos + len(gname):pos + len(gname) + 15]
            neg_before = any(nw in before_text for nw in _NEG_BEFORE)
            neg_after = any(nw in after_text for nw in _NEG_AFTER)
            if neg_before:
                intervening_genre = any(
                    _genre_kw_pos(before_text, g2) >= 0
                    for g2 in GENRE_KEYWORDS if g2 != gname
                )
                if intervening_genre:
                    neg_before = False
            if not (neg_before or neg_after):
                main_include.extend(gids)
    return list(set(main_include + more_include)), list(set(all_exclude))


def _rule_based_confused_analysis(text: str) -> dict:
    """Local rule-based mood analysis — zero API calls, <1ms.
    Uzun metinlerden mood, süre kısıtı, dönem tercihi ve tür ipuçlarını çıkarır.
    """
    text_lower = text.lower().strip()
    scored = {}
    for triggers, mood_id in _RULE_MOOD_MAP.items():
        score = sum(2 for t in triggers
                    if t in text_lower and not _kw_is_negated(text_lower, t))
        if score > 0:
            scored[mood_id] = score * _MOOD_WEIGHTS.get(mood_id, 0.10) * 100

    # Zaman kısıtlaması
    time_c = _extract_time_constraint(text)
    # Dönem tercihi
    era_c = _extract_era_constraint(text)
    # Karmaşık negation ile tür include/exclude ayır
    genre_hints, exclude_genre_hints = _parse_complex_negation(text)
    # İçerik bazlı reddetme ("şiddet içermesin", "kan olmasın") → tür hariç tut
    for phrase, ex_ids in _CONTENT_NEGATION.items():
        if phrase in text_lower and ex_ids:
            exclude_genre_hints = list(set(exclude_genre_hints + ex_ids))
    # Çocuk/aile-güvenli içerik → korku/gerilim/şiddet türlerini hariç tut,
    # aile+animasyon türlerini öne çıkar (discover/rerank yolu için tutarlılık).
    if _detect_child_safe(text):
        exclude_genre_hints = list(set(exclude_genre_hints + _CHILD_EXCLUDE_GENRES))
        genre_hints = list((set(genre_hints) | set(_CHILD_SAFE_GENRES)) - set(exclude_genre_hints))
    # Dil filtresi (kelime-sınırı bazlı, bare sıfatlar dahil)
    lang_filter = _detect_lang_filter(text)

    filters = {}
    if "yeni" in text_lower:
        filters["year_gte"] = 2025

    if not scored:
        return {
            "mood_mix": [{"mood_id": "zihin", "title": "Zihin", "percentage": 60},
                         {"mood_id": "gece", "title": "Gece", "percentage": 40}],
            "message": "Anlat bakalım, ne tür bir gece arzuluyorsun?",
            "ustad_line": "Kafan karışık gibi... Hadi bir bakalım arşive.",
            "time_constraint": time_c,
            "era_preference": era_c,
            "genre_hints": genre_hints,
            "exclude_genre_hints": exclude_genre_hints,
            "lang_filter": lang_filter,
            "filters": filters,
        }

    total = sum(scored.values())
    mood_mix = [
        {"mood_id": mid, "title": mid.replace("-", " ").title(), "percentage": round(pct * 100 / total)}
        for mid, pct in sorted(scored.items(), key=lambda x: -x[1])[:4]
    ]
    top_mood = mood_mix[0]["mood_id"]
    top_title = top_mood.replace("-", " ").title()

    # Çelişkili/karmaşık duygu: ilk iki mood yakınsa tek mood'a indirgeme —
    # ikisini birlikte onurlandır (örn. "hem gülmek hem hüzünlenmek").
    if len(mood_mix) >= 2 and mood_mix[1]["percentage"] >= mood_mix[0]["percentage"] * 0.6:
        second_title = mood_mix[1]["mood_id"].replace("-", " ").title()
        message = f"İçinde iki ses var gibi: hem '{top_title}' hem '{second_title}'. İkisini de harmanladım."
        ustad_line = f"Karışık bir ruh hâli bu evlat — '{top_title}' ile '{second_title}' arasında bir yerdesin. İkisini de gözettim."
    else:
        message = f"Sana en uygun ruh hali: {top_title}."
        ustad_line = f"Şu anki haline en çok '{top_title}' yakışıyor gibi."

    return {
        "mood_mix": mood_mix,
        "message": message,
        "ustad_line": ustad_line,
        "time_constraint": time_c,
        "era_preference": era_c,
        "genre_hints": genre_hints,
        "exclude_genre_hints": exclude_genre_hints,
        "lang_filter": lang_filter,
        "filters": filters,
    }


def _extract_time_constraint(text: str) -> dict | None:
    """Süre kısıtı: {"mode": "short"|"long", "max_minutes": int|None} veya None."""
    t = text.lower()

    # Negatif süre: "90 dakikadan uzun olmasın", "2 saatten fazla olmasın"
    neg_min = re.search(r"(\d{2,3})\s*(?:dakikadan|dakika|dk)\s*(?:uzun|fazla)\s*(?:olmasın|olmasin)", t)
    if neg_min:
        return {"mode": "short", "max_minutes": int(neg_min.group(1))}

    neg_hour = re.search(r"(\d+(?:[.,]\d)?)\s*(?:saatten|saat)\s*(?:uzun|fazla)\s*(?:olmasın|olmasin)", t)
    if neg_hour:
        h = float(neg_hour.group(1).replace(",", "."))
        return {"mode": "short", "max_minutes": int(h * 60)}

    # Spesifik dakika: "45 dakikalık", "90 dakika"
    min_match = re.search(r"(\d{2,3})\s*(?:dakika|dk)", t)
    if min_match:
        return {"mode": "short", "max_minutes": int(min_match.group(1))}

    # Saat bazlı: "2 saatten az", "1.5 saat"
    hour_match = re.search(r"(\d+(?:[.,]\d)?)\s*saat(?:ten|ten)?\s*(?:az|kısa|altı|altında)?", t)
    if hour_match:
        h = float(hour_match.group(1).replace(",", "."))
        return {"mode": "short" if h <= 2 else "long", "max_minutes": int(h * 60)}

    if any(p in t for p in ("kısa", "kisa", "çabuk", "hemen bitsin", "vaktim az",
                             "vaktim yok", "zamanım az", "zamanım yok",
                             "kısa film", "kısacık", "hızlıca", "az vaktim",
                             "çabucak", "uzun olmasın", "çok uzun olmasın")):
        return {"mode": "short", "max_minutes": 100}
    if any(p in t for p in ("uzun film", "epik", "vaktim bol", "zamanım bol",
                             "uzun soluklu", "akşamı kurtaracak")):
        return {"mode": "long", "max_minutes": None}
    return None


def _extract_era_constraint(text: str) -> dict | None:
    """Dönem kısıtı: {"min_year": int|None, "max_year": int|None} veya None."""
    t = text.lower()

    # "son 5 yıl", "son 3 yılın", "geçen 10 yıl" → güncel yıldan geriye
    recent_n = re.search(r"(?:son|geçen|geçtiğimiz)\s+(\d{1,2})\s*yıl", t)
    if recent_n:
        from datetime import datetime
        n = int(recent_n.group(1))
        return {"min_year": datetime.now().year - n, "max_year": None}

    # Onluk dilimler: "80'ler", "80'lerden", "90lar", "2000'ler"
    decade_match = re.search(r"(\d{2,4})[''’]?\s*(?:ler|lar|lerden|lardan)", t)
    if decade_match:
        d = int(decade_match.group(1))
        if d < 100:
            d = 1900 + d if d >= 20 else 2000 + d
        return {"min_year": d, "max_year": d + 9}

    # Tam yıl: "2000 öncesi", "1990 sonrası"
    year_match = re.search(r"(1\d{3}|20[0-2]\d)\s*(öncesi|sonrası|öncesinden|sonrasından)?", t)
    if year_match:
        y = int(year_match.group(1))
        suffix = year_match.group(2) or ""
        if "önce" in suffix:
            return {"min_year": None, "max_year": y - 1}
        if "sonra" in suffix:
            return {"min_year": y, "max_year": None}
        return {"min_year": y, "max_year": y + 9}

    if any(p in t for p in ("eski", "klasik", "vintage", "retro", "zamansız", "kült film")):
        return {"min_year": None, "max_year": 2000}
    if any(p in t for p in ("yeni", "son çıkan", "güncel", "modern", "trend",
                             "bu yıl", "son zamanlar", "son yıllar")):
        return {"min_year": 2020, "max_year": None}
    return None


# ═══════════════════════════════════════════════════════════════
# STREAMING PLATFORM DETECTION
# ═══════════════════════════════════════════════════════════════

def _detect_platform_filter(text: str) -> str | None:
    """Yayın platformu ERİŞİLEBİLİRLİK sorgusu mu? ("Netflix'te olan", "amazonda var mı").
    Üretim-şirketi temalarıyla ("netflix yapımı/filmi") karışmaması için EK/İPUCU şart:
      - bitişik durum eki ("netflixte", "amazonda", "mubideki") VEYA
      - cümlede erişim ipucu ("olan/var/izle/mevcut/nerede/...").
    Kelime sınırı kullanır → "max" "maksimum" içinde, "prime" "primer" içinde eşleşmez.
    """
    t = _fold(text)  # aksansız + noktalama→boşluk ("netflix'te" → "netflix te")
    if not t:
        return None
    padded = f" {t} "
    has_cue = any(f" {c}" in padded for c in _PLATFORM_AVAIL_CUES)
    for key, info in STREAMING_PLATFORMS.items():
        for alias in info["aliases"]:
            a = _fold(alias)
            if not a:
                continue
            glued = any(f" {a}{suf} " in padded for suf in _PLATFORM_LOC_SUFFIXES)
            present = f" {a} " in padded
            if glued or (present and has_cue):
                return key
    return None


# ═══════════════════════════════════════════════════════════════
# FUZZY TITLE MATCH — alias'ta olmayan film adlarını dene
# ═══════════════════════════════════════════════════════════════

_FUZZY_CACHE: dict[str, tuple[str, float]] = {}

def _fuzzy_title_match(text: str, min_ratio: float = 0.85) -> tuple[str | None, float]:
    """Alias'tan tam eşleşmeyen metinler için fuzzy match dene.
    Türkçe karakterleri katlayarak karşılaştırır (dovus kulubu → dövüş kulübü).
    Önce cache'e bak, yoksa TURKISH_TITLE_ALIASES'te ara.
    """
    folded = _fold(text)
    if not folded or len(folded) < 3:
        return None, 0.0
    cached = _FUZZY_CACHE.get(folded)
    if cached:
        return cached if cached[1] >= min_ratio else (None, 0.0)
    best_match, best_ratio = None, 0.0
    for alias, eng_title in TURKISH_TITLE_ALIASES.items():
        alias_folded = _fold(alias)
        ratio = SequenceMatcher(None, folded, alias_folded).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = eng_title
    _FUZZY_CACHE[folded] = (best_match, best_ratio)
    if best_match and best_ratio >= min_ratio:
        return best_match, best_ratio
    return None, 0.0


# ═══════════════════════════════════════════════════════════════
# LANGUAGE FILTER DETECTION
# ═══════════════════════════════════════════════════════════════

def _detect_lang_filter(text: str) -> str | None:
    """Metinde dil/ülke adı geçiyorsa ISO kodu döndür (kelime-sınırı bazlı,
    aksan-duyarsız). 'kore korku', 'japon animasyon', 'fransız dram' yakalanır."""
    # Önce çok-kelimeli özgün ifadeler (substring, hızlı)
    tl = text.lower()
    for phrase, code in LANGUAGE_KEYWORDS.items():
        if phrase in tl:
            return code
    # Sonra kelime-sınırı bazlı bare sıfatlar (folded)
    folded = _fold(text)
    for pat, code in _LANG_PATTERNS:
        if pat.search(folded):
            return code
    return None


# ═══════════════════════════════════════════════════════════════
# CHAT ENGINE (local only — zero external API calls)
# ═══════════════════════════════════════════════════════════════
class ChatEngine:
    def __init__(self, db):
        self.db = db

    async def process(self, text: str, limit: int = 6, min_vote: float = 5.0,
                      exclude_ids: list = None) -> dict:
        """
        Main entry point. Detects intent locally, routes to semantic search.
        Zero external API calls — all processing is purely local.
        """
        exclude_ids = set(exclude_ids or [])
        text = text.strip()

        if not text or len(text) < 2:
            return self._empty_response("Lütfen ne tür bir film aradığını yaz.")

        intent = self.detect_intent(text)
        logger.info("[ChatEngine] Intent: %s | query: '%s'", intent.type, text)

        # Rule-based mood/era/genre analysis (tek geçiş, <1ms)
        mood_analysis = _rule_based_confused_analysis(text)
        era_preference = mood_analysis.get("era_preference")
        genre_hints = mood_analysis.get("genre_hints")
        mood_distribution = mood_analysis.get("mood_mix", [])
        lang_filter = mood_analysis.get("lang_filter")
        exclude_genre_hints = mood_analysis.get("exclude_genre_hints")

        # Route to local semantic search (handles entity boost internally)
        from backend.services.semantic_search import semantic_engine

        result = await semantic_engine.search(
            query_text=text,
            limit=limit,
            exclude_ids=exclude_ids,
            min_vote=min_vote,
            era_preference=era_preference,
            genre_hints=genre_hints,
            mood_distribution=mood_distribution,
            lang_filter=lang_filter,
            exclude_genre_hints=exclude_genre_hints,
        )

        # Üretim OOM fallback: lokal sentence-transformers modeli kullanılamıyorsa
        # (Render free tier'da 512MB RAM sınırı → _get_model() RuntimeError fırlatır,
        # search() "semantic_error"/"semantic_not_ready" döner) Gemini embedding +
        # fast_search matrisi ile vektör araması yap. 500MB model GEREKTİRMEZ.
        if not result.get("movies"):
            gemini_result = await self._gemini_vector_search(
                text, limit, min_vote, list(exclude_ids),
                era_preference=era_preference,
                genre_hints=genre_hints,
                mood_distribution=mood_distribution,
                lang_filter=lang_filter,
                exclude_genre_hints=exclude_genre_hints,
            )
            if gemini_result and gemini_result.get("movies"):
                logger.info("[ChatEngine] Lokal model yok → Gemini vektör araması kullanıldı (%d film)",
                            len(gemini_result["movies"]))
                result = gemini_result

        # Augment response with intent info + rule-based mood mix
        result["intent"] = intent.type

        # Intent'e göre anlaşılır query_understanding mesajı üret
        if intent.type == "actor_recommendation" and intent.person_name:
            result["query_understanding"] = f"'{intent.person_name}' filmlerini arıyorsun."
        elif intent.type == "director_recommendation" and intent.person_name:
            result["query_understanding"] = f"'{intent.person_name}' yönetmenliğindeki filmler."
        elif intent.type == "similar_to_movie" and intent.reference_title:
            result["query_understanding"] = f"'{intent.reference_title}' tadında filmler."
        elif intent.type == "genre_recommendation" and intent.genres:
            result["query_understanding"] = f"Tür bazlı arama: {text}"
        elif intent.type == "feedback":
            result["query_understanding"] = f"Yeni öneriler getiriyorum..."
        else:
            result["query_understanding"] = text
        result["mood_mix"] = mood_distribution
        if not result.get("ustad_line") or result.get("mode") == "semantic_no_match":
            result["ustad_line"] = mood_analysis.get("ustad_line", result.get("ustad_line", ""))
        result["message"] = mood_analysis.get("message", "")
        # Gemini vektör yolu kullanıldıysa mode'u koru; aksi halde lokal.
        if result.get("mode") != "semantic_gemini":
            result["mode"] = "semantic_local"
        return result

    # ─────────── GEMINI VECTOR SEARCH (üretim semantic yolu) ───────────
    async def _gemini_vector_search(
        self, text: str, limit: int, min_vote: float, exclude_ids: list,
        era_preference: dict | None = None,
        genre_hints: list[int] | None = None,
        mood_distribution: list[dict] | None = None,
        lang_filter: str | None = None,
        exclude_genre_hints: list[int] | None = None,
    ) -> Optional[dict]:
        """
        Üretim-güvenli semantic arama: Gemini text-embedding-004 ile sorguyu
        vektörleştirir, önceden hesaplanmış fast_search matrisinde (768-dim,
        bellekte) cosine benzerlik araması yapar.

        Lokal sentence-transformers'tan farkı: 500MB model BELLEKTE TUTULMAZ —
        sorgu embedding'i tek bir Gemini API çağrısıyla alınır (~100ms). Bu
        sayede Render free tier'ın 512MB RAM sınırı altında PATH 2 çalışır.

        Gereksinimler: GEMINI_API_KEY (embedding_service.is_available) ve
        fast_search tablosunda embed edilmiş filmler (fast_search_engine.is_ready).
        İkisinden biri yoksa None döner ve çağıran taraf PATH 3'e düşer.
        """
        try:
            from backend.services.embedding_service import embedding_service
            from backend.services.fast_search import fast_search_engine
        except Exception:
            return None

        if not getattr(embedding_service, "is_available", False):
            return None
        if not getattr(fast_search_engine, "is_ready", False):
            return None

        # Mood/entity sinyalleri için sorgu genişletme (lokal motorla parite).
        search_text = text
        try:
            from backend.services.semantic_search import (
                extract_entities_locally, _MOOD_QUERY_EXPANSIONS,
            )
            parsed = extract_entities_locally(text)
            query_lower = parsed.get("query_lower", text.lower())
            search_text = parsed.get("raw_clean_query") or text
            expansions = [
                kw for trig, kw in _MOOD_QUERY_EXPANSIONS.items() if trig in query_lower
            ]
            if expansions:
                search_text = f"{search_text} {' '.join(expansions)}"
            if not search_text.strip():
                search_text = text
        except Exception:
            search_text = text

        try:
            query_vec = await embedding_service.get_embedding(search_text)
        except Exception as e:
            logger.warning("[ChatEngine] Gemini embedding başarısız: %s", e)
            return None
        if not query_vec:
            return None

        try:
            movies = fast_search_engine.search(
                query_vec=query_vec,
                limit=limit,
                exclude_ids=set(exclude_ids or []),
                min_vote=min_vote,
                era_preference=era_preference,
                genre_hints=genre_hints,
                mood_distribution=mood_distribution,
                lang_filter=lang_filter,
                exclude_genre_hints=exclude_genre_hints,
            )
        except Exception as e:
            logger.warning("[ChatEngine] fast_search araması başarısız: %s", e)
            return None

        if not movies:
            return None

        top_title = movies[0].get("title", "")
        top_score = movies[0].get("mood_score", 0)
        return {
            "movies": movies,
            "ustad_line": (
                f"'{top_title}' tam senin anlattığın dünyadan. "
                f"Vektör arşivinden %{top_score} benzerlikle seçtim evlat."
            ),
            "mode": "semantic_gemini",
            "query_understanding": search_text,
        }

    # ─────────── CROSS-SIGNAL COLLECTOR ───────────
    @staticmethod
    def _collect_signals(text: str) -> tuple:
        """Intent belirlemeden önce tüm çapraz sinyalleri topla (era, time, genre)."""
        return (
            _extract_era_constraint(text),
            _extract_time_constraint(text),
            *_parse_complex_negation(text),
        )

    # ─────────── INTENT DETECTION ───────────
    def detect_intent(self, text: str) -> Intent:
        """Rule-based intent classification (fully local)."""
        # ── Argo/kısaltma normalizasyonu ──
        # "knk film at" → "arkadaş film öner", "baya iyi bi film" → "bayağı iyi bir film"
        text_slang = _normalize_slang(text)
        if text_slang != text:
            logger.info("Slang normalize: '%s' → '%s'", text, text_slang)
            text = text_slang

        # ── Fuzzy ön-düzeltme: tür/kişi typo'larını düzelt ──
        # "komeedi"→"komedi", "nollan"→"nolan", "siyfi"→"sci-fi" vb.
        text_corrected = _fuzzy_preprocess(text)
        if text_corrected != text.lower().strip():
            logger.info("Fuzzy preprocess: '%s' → '%s'", text, text_corrected)
            text = text_corrected  # downstream'de düzeltilmiş metin kullanılır

        text_lower = text.lower().strip()
        text_norm = _normalize(text)

        # ── "X gibi ama daha Y" → feedback'ten ÖNCE tespit; feedback hijack'ini engelle ──
        _has_similar_pat = any(re.search(p, text_lower) for p in SIMILAR_PATTERNS)

        # ── Önce feedback (similar pattern varsa atla; "X gibi ama daha kısa" feedback değil) ──
        if not _has_similar_pat:
            for pattern, fb_type in FEEDBACK_PATTERNS.items():
                if pattern in text_lower:
                    return Intent("feedback", feedback_type=fb_type, original_text=text)

        # ── Platform filter (text'te streaming platform adı geçiyorsa) ──
        platform_filter = _detect_platform_filter(text)

        # ── Çoklu oyuncu birlikte: "Al Pacino ve De Niro birlikte" ──
        _mp1, _mp2 = _detect_multi_person(text)
        if _mp1 and _mp2:
            era_c, time_c, g_hints, ex_g_hints = self._collect_signals(text)
            return Intent("multi_person", person_name=_mp1, person_name2=_mp2,
                          person_type="actor", original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_c, time_constraint=time_c,
                          genres=g_hints, exclude_genres=ex_g_hints)

        # ── Yönetmen keyword'leri (yüksek güven) ──
        for kw in DIRECTOR_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                person_name = text[:idx].strip().strip('"\'')
                if not (person_name and _is_plausible_person_name(person_name, allow_single=True)):
                    person_name, _ = _find_known_person_in(text[:idx])
                if person_name:
                    era_c, time_c, g_hints, ex_g_hints = self._collect_signals(text)
                    return Intent("director_recommendation", person_name=person_name,
                                  person_type="director", original_text=text,
                                  platform_filter=platform_filter,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints,
                                  mood_signals=_rule_based_confused_analysis(text).get("mood_mix", []),
                                  lang_filter=_detect_lang_filter(text))

        # ── Oyuncu keyword'leri (yüksek güven) ──
        for kw in PERSON_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                person_name = text[:idx].strip().strip('"\'')
                ptype = "actor"
                if not (person_name and _is_plausible_person_name(person_name, allow_single=True)):
                    person_name, ptype = _find_known_person_in(text[:idx])
                if person_name:
                    era_c, time_c, g_hints, ex_g_hints = self._collect_signals(text)
                    return Intent(f"{ptype}_recommendation", person_name=person_name,
                                  person_type=ptype, original_text=text,
                                  platform_filter=platform_filter,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints,
                                  mood_signals=_rule_based_confused_analysis(text).get("mood_mix", []),
                                  lang_filter=_detect_lang_filter(text))

        # ── Blend: "X ile Y ortası" — iki referanslı karışım (tek similar'dan ÖNCE) ──
        for pat in BLEND_PATTERNS:
            mb = re.search(pat, text_lower)
            if mb:
                r1 = mb.group(1).strip().strip('"\'')
                r2 = mb.group(2).strip().strip('"\'')
                if len(r1) >= 2 and len(r2) >= 2:
                    r1n, r2n = _normalize(r1), _normalize(r2)
                    # İkisi de mood/şey phrase'i değilse blend say
                    _junk = ("bir şey", "birsey", "film", "sey", "bisey", "şey")
                    if any(j in r1n for j in _junk) or any(j in r2n for j in _junk):
                        break
                    # İki referans da SALT tür adıysa bu bir film blend'i değil
                    # ("komedi ile dram ortası") → tür akışına bırak
                    if r1n in GENRE_KEYWORDS and r2n in GENRE_KEYWORDS:
                        break
                    ref1 = TURKISH_TITLE_ALIASES.get(r1n, r1)
                    ref2 = TURKISH_TITLE_ALIASES.get(r2n, r2)
                    era_c, time_c, g_hints, ex_g_hints = self._collect_signals(text)
                    return Intent("blend_movies", reference_title=ref1,
                                  reference_title2=ref2, original_text=text,
                                  platform_filter=platform_filter,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints)

        # ── Similar-to patterns ("X gibi", "X tarzı") — GUARD: mood phrase'i yakalama ──
        for pat in SIMILAR_PATTERNS:
            m = re.search(pat, text_lower)
            if m:
                ref_title = m.group(1).strip().strip('"\'')
                if len(ref_title) >= 2:
                    # Guard: referans mood phrase / genre keyword'üyse atla
                    ref_norm = _normalize(ref_title)
                    if len(ref_norm.split()) <= 2 and any(mp in ref_norm for mp in ("bir şey", "birsey", "şey", "film", "sey", "bisey")):
                        break
                    if any(_genre_kw_in(ref_norm, gw) for gw in GENRE_KEYWORDS):
                        break
                    alias_check = ref_norm
                    if alias_check in TURKISH_TITLE_ALIASES:
                        ref_title = TURKISH_TITLE_ALIASES[alias_check]
                    # "X gibi ama daha Y" → modifier'ı çıkar
                    sim_mod = _extract_similar_modifier(text)
                    era_c, time_c, g_hints, ex_g_hints = self._collect_signals(text)
                    return Intent("similar_to_movie", reference_title=ref_title, original_text=text,
                                  platform_filter=platform_filter, similar_modifier=sim_mod,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints,
                                  lang_filter=_detect_lang_filter(text))

        # ── Çapraz sinyal toplama
        era_constraint = _extract_era_constraint(text)
        time_constraint = _extract_time_constraint(text)
        genre_hints, exclude_genre_hints = _parse_complex_negation(text)
        cross_mood = _rule_based_confused_analysis(text).get("mood_mix", [])

        if text_norm in TURKISH_TITLE_ALIASES:
            return Intent("exact_movie_search",
                          reference_title=TURKISH_TITLE_ALIASES[text_norm],
                          original_text=text, platform_filter=platform_filter)

        # Fuzzy title match — alias'ta tam eşleşme yoksa yakın eşleşme dene
        fuzzy_match, fuzzy_ratio = _fuzzy_title_match(text)
        if fuzzy_match:
            return Intent("exact_movie_search",
                          reference_title=fuzzy_match,
                          original_text=text, platform_filter=platform_filter)

        # Alias'ı TAM KELİME olarak ara
        _padded_norm = f" {text_norm} "
        for alias, eng_title in TURKISH_TITLE_ALIASES.items():
            if len(alias) >= 4 and f" {alias} " in _padded_norm:
                remaining = _padded_norm.replace(f" {alias} ", " ").strip()
                if len(remaining) < 10 or not _has_mood_words(remaining):
                    return Intent("exact_movie_search",
                                  reference_title=eng_title,
                                  original_text=text, platform_filter=platform_filter)

        genres_wanted = list(set(genre_hints))
        genres_excluded = list(set(exclude_genre_hints))
        # Ek genre ayrıştırma — olumsuzluk içeren türleri exclude'a ekle
        _POST_NEG = ("hariç", "dışında", "olmasın", "istemiyorum", "değil")
        for genre_name, genre_ids in GENRE_KEYWORDS.items():
            pos = _genre_kw_pos(text_lower, genre_name)
            if pos >= 0:
                before = text_lower[max(0, pos - 20):pos]
                after = text_lower[pos + len(genre_name):pos + len(genre_name) + 15]
                neg_b = any(nw in before for nw in NEGATIVE_WORDS)
                neg_a = any(nw in after for nw in _POST_NEG)
                if neg_b:
                    has_intervening = any(
                        _genre_kw_pos(before, g2) >= 0
                        for g2 in GENRE_KEYWORDS if g2 != genre_name
                    )
                    if has_intervening:
                        neg_b = False
                is_negative = neg_b or neg_a
                if is_negative:
                    genres_excluded = list(set(genres_excluded + genre_ids))
                else:
                    genres_wanted = list(set(genres_wanted + genre_ids))

        # Kelime-içi olumsuzlama ("korkutmayan", "gerilimsiz") — "korku/gerilim"
        # substring'i yanlışlıkla wanted'a eklenmiş olabilir; exclude'a taşı.
        _NEG_SUFFIX_GENRE = {
            "korkutmayan": [27, 53], "korkutmaz": [27], "ürkütmeyen": [27, 53],
            "korkmadan": [27], "gerilimsiz": [53], "kan içermeyen": [27],
        }
        for _w, _gids in _NEG_SUFFIX_GENRE.items():
            if _fold(_w) in _fold(text_lower):
                genres_excluded = list(set(genres_excluded + _gids))
                genres_wanted = [g for g in genres_wanted if g not in _gids]

        # ── Çocuk / aile-güvenli içerik: korku/gerilim/şiddet HARİÇ, aile+animasyon ──
        # "çocuk için uygun film", "korkutmayan çocuk filmi", "aile dostu", "ailecek"
        if _detect_child_safe(text):
            _excl = set(_CHILD_EXCLUDE_GENRES) | set(genres_excluded)
            _genres = list((set(_CHILD_SAFE_GENRES) | set(genres_wanted)) - _excl)
            return Intent("genre_recommendation", genres=_genres,
                          exclude_genres=list(_excl), original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          mood_signals=cross_mood)

        # ── Yaş/yetişkin sorgusu → genel mood önerisi (anlamsız exact-search'i önle) ──
        if _detect_age_query(text):
            return Intent("mood_recommendation", original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          genres=genres_wanted, exclude_genres=genres_excluded,
                          mood_signals=cross_mood)

        # Tümce düzeyinde ruh hali kontrolü — alias/kişi eşleşmeyen metinlerde
        for phrase in MOOD_PHRASES:
            if phrase in text_lower:
                return Intent("mood_recommendation", original_text=text,
                              platform_filter=platform_filter,
                              era_constraint=era_constraint,
                              time_constraint=time_constraint,
                              genres=genres_wanted,
                              exclude_genres=genres_excluded,
                              mood_signals=cross_mood)

        # Kişi adı tespiti — tmdb'ye async lookup olmadan heuristic
        if _looks_like_person_name(text) and _normalize(text) not in TURKISH_TITLE_ALIASES:
            return Intent("actor_recommendation", person_name=text.strip(),
                          person_type="actor", original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          genres=genres_wanted,
                          exclude_genres=genres_excluded,
                          mood_signals=cross_mood,
                          lang_filter=_detect_lang_filter(text))

        # ── "İsim + tür/dönem" (PERSON_KEYWORD'süz): "Nolan bilim kurgu",
        #    "Tom Hanks komedi", "Tarantino 90lar suç" → oyuncu/yönetmen + tür ──
        if genres_wanted or era_constraint or _detect_lang_filter(text):
            _pname, _ptype = _extract_leading_person(text)
            if _pname:
                return Intent(
                    f"{_ptype}_recommendation", person_name=_pname,
                    person_type=_ptype, original_text=text,
                    platform_filter=platform_filter,
                    era_constraint=era_constraint, time_constraint=time_constraint,
                    genres=genres_wanted, exclude_genres=genres_excluded,
                    mood_signals=cross_mood, lang_filter=_detect_lang_filter(text))

        # ── KNOWN_PERSONS scan — cümle içinde tanınmış isim varsa yakala ──
        _kp_name, _kp_type = _find_known_person_in(text)
        if _kp_name:
            return Intent(f"{_kp_type}_recommendation", person_name=_kp_name,
                          person_type=_kp_type, original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          genres=genres_wanted,
                          exclude_genres=genres_excluded,
                          mood_signals=cross_mood,
                          lang_filter=_detect_lang_filter(text))

        if _is_short_title_like(text):
            return Intent("exact_movie_search", reference_title=text.strip(),
                          original_text=text, platform_filter=platform_filter)

        if genres_wanted and not _has_mood_words(text):
            return Intent("genre_recommendation", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          mood_signals=cross_mood)

        if genres_wanted or genres_excluded:
            return Intent("mixed_request", genres=genres_wanted,
                          exclude_genres=genres_excluded, original_text=text,
                          platform_filter=platform_filter,
                          era_constraint=era_constraint,
                          time_constraint=time_constraint,
                          mood_signals=cross_mood)

        return Intent("mood_recommendation", original_text=text,
                      platform_filter=platform_filter,
                      era_constraint=era_constraint,
                      time_constraint=time_constraint,
                      genres=genres_wanted,
                      exclude_genres=genres_excluded,
                      mood_signals=cross_mood)

    @staticmethod
    def _empty_response(msg: str) -> dict:
        return {
            "mode": "error",
            "intent": "unknown",
            "query_understanding": msg,
            "ustad_line": "",
            "message": msg,
            "mood_mix": [],
            "movies": [],
        }


# ═══════════════════════════════════════════════════════════════
# CHAT HINT PARSER — embedding öncesi hafif string analizi
# Çalışma süresi: <1ms (regex, dict lookup)
# ═══════════════════════════════════════════════════════════════

# Bonus tavanı — sci-fi gibi güçlü sinyaller için +0.50'ye kadar
_MAX_BONUS = 0.50

_TIME_CONSTRAINT_KWS = [
    "kısa", "çabuk", "vaktim az", "zamanım yok", "sipsak", "hemen bitsin",
    "az vaktim", "hızlı", "kısa film", "kısacık", "hızlıca", "çabucak",
    "az zaman", "vakit az", "hızla", "çabuk biter", "kısaca", "zamanım az",
]

# ── Kategori/tema → mood + tür bonus haritası ──────────────────────────────────
# Mood ID'leri kod tabanındaki GERÇEK mood'lara karşılık gelir
# (örn. sci-fi → yolculuk+zihin; korku → deep-chills "Derin Ürperti").
_CATEGORY_HINT_MAP: dict[str, dict] = {
    # ── Sci-fi / uzay → yolculuk (keşif) + zihin (zihin-büken), +0.50 ──────────
    "uzay":        {"mood_boost": {"yolculuk": 0.50, "zihin": 0.30},    "genre_ids": [878]},
    "gelecek":     {"mood_boost": {"yolculuk": 0.40, "zihin": 0.40},    "genre_ids": [878]},
    "bilim kurgu": {"mood_boost": {"yolculuk": 0.40, "zihin": 0.40},    "genre_ids": [878]},
    "gezegen":     {"mood_boost": {"yolculuk": 0.50, "zihin": 0.30},    "genre_ids": [878]},
    "galaksi":     {"mood_boost": {"yolculuk": 0.50},                   "genre_ids": [878]},
    "yıldız":      {"mood_boost": {"yolculuk": 0.40},                   "genre_ids": [878]},
    "yapay zeka":  {"mood_boost": {"zihin": 0.50, "karmakar": 0.30},    "genre_ids": [878]},

    # ── Suç / gerilim → gece (noir) ağırlığı + suç/gerilim tür maskesi ─────────
    "katil":       {"mood_boost": {"gece": 0.45, "adrenalin": 0.25},    "genre_ids": [53, 80]},
    "cinayet":     {"mood_boost": {"gece": 0.45, "zihin": 0.20},        "genre_ids": [80, 53]},
    "ajan":        {"mood_boost": {"adrenalin": 0.40, "gece": 0.25},    "genre_ids": [28, 80]},
    "casusluk":    {"mood_boost": {"adrenalin": 0.35, "gece": 0.25},    "genre_ids": [28, 80]},
    "polis":       {"mood_boost": {"gece": 0.40, "adrenalin": 0.25},    "genre_ids": [80]},
    "dedektif":    {"mood_boost": {"gece": 0.40, "zihin": 0.30},        "genre_ids": [80, 9648]},
    "gerilim":     {"mood_boost": {"gece": 0.45, "adrenalin": 0.25},    "genre_ids": [53]},
    "suç":         {"mood_boost": {"gece": 0.40, "adrenalin": 0.25},    "genre_ids": [80]},
    "gizem":       {"mood_boost": {"gece": 0.30, "zihin": 0.30},        "genre_ids": [9648]},

    # ── Korku / ürperti → deep-chills (Derin Ürperti) + korku türü ────────────
    "korkutucu":   {"mood_boost": {"deep-chills": 0.50},               "genre_ids": [27]},
    "ürpertici":   {"mood_boost": {"deep-chills": 0.50},               "genre_ids": [27]},
    "korku":       {"mood_boost": {"deep-chills": 0.50, "gece": 0.20}, "genre_ids": [27]},
    "karanlık":    {"mood_boost": {"deep-chills": 0.40, "gece": 0.30}, "genre_ids": [27]},
    # "gece" kelimesi "bu gece" (zamansal) ile karışmasın diye korku türü vermez:
    "gece":        {"mood_boost": {"gece": 0.40},                      "genre_ids": []},

    # ── Diğer tür/tema bonusları ──────────────────────────────────────────────
    "savaş":       {"mood_boost": {"adrenalin": 0.40},                  "genre_ids": [10752, 28]},
    "romantik":    {"mood_boost": {"askbahcesi": 0.40},                 "genre_ids": [10749]},
    "aşk":         {"mood_boost": {"askbahcesi": 0.35, "gozyasi": 0.20},"genre_ids": [10749]},
    "komedi":      {"mood_boost": {"kahkaha": 0.40, "battaniye": 0.15}, "genre_ids": [35]},
    "nostalji":    {"mood_boost": {"zamanyolcusu": 0.40},               "genre_ids": []},
    "animasyon":   {"mood_boost": {"battaniye": 0.30, "kahkaha": 0.20}, "genre_ids": [16]},
    "aksiyon":     {"mood_boost": {"adrenalin": 0.40},                  "genre_ids": [28]},
    "felsefe":     {"mood_boost": {"zihin": 0.40, "sessiz": 0.20},      "genre_ids": [18]},
    "felsefi":     {"mood_boost": {"zihin": 0.45, "sessiz": 0.20},      "genre_ids": []},
    "dram":        {"mood_boost": {"gozyasi": 0.30, "sessiz": 0.20},    "genre_ids": [18]},
    "ağır":        {"mood_boost": {"sessiz": 0.35, "gozyasi": 0.25},    "genre_ids": [18]},

    # ── Bağlam/izleyici bazlı sinyaller ──────────────────────────────────────
    # Sevgili / romantik gece
    "sevgilimle":  {"mood_boost": {"askbahcesi": 0.50},                 "genre_ids": [10749]},
    "sevgili":     {"mood_boost": {"askbahcesi": 0.40},                 "genre_ids": [10749]},
    "ilk buluşma": {"mood_boost": {"askbahcesi": 0.45, "kahkaha": 0.20}, "genre_ids": [10749, 35]},
    "nişanlımla":  {"mood_boost": {"askbahcesi": 0.45},                 "genre_ids": [10749]},
    "şehvetli":    {"mood_boost": {"askbahcesi": 0.50},                 "genre_ids": [10749, 18]},
    "tutkulu":     {"mood_boost": {"askbahcesi": 0.45},                 "genre_ids": [10749, 18]},
    "erotik":      {"mood_boost": {"askbahcesi": 0.50},                 "genre_ids": [10749, 18]},

    # Aile / çocuk
    "ailemle":     {"mood_boost": {"battaniye": 0.40, "kahkaha": 0.25}, "genre_ids": [10751]},
    "aile filmi":  {"mood_boost": {"battaniye": 0.40, "kahkaha": 0.25}, "genre_ids": [10751]},
    "çocuğuma":    {"mood_boost": {"battaniye": 0.35, "kahkaha": 0.25}, "genre_ids": [16, 10751]},
    "çocukla":     {"mood_boost": {"battaniye": 0.35, "kahkaha": 0.25}, "genre_ids": [16, 10751]},
    "çocuklar":    {"mood_boost": {"battaniye": 0.30, "kahkaha": 0.25}, "genre_ids": [16, 10751]},
    "çocuk filmi": {"mood_boost": {"battaniye": 0.35, "kahkaha": 0.20}, "genre_ids": [16, 10751]},

    # Sosyal bağlam
    "anneme":      {"mood_boost": {"battaniye": 0.40, "gozyasi": 0.20}, "genre_ids": [10751, 18]},
    "annemle":     {"mood_boost": {"battaniye": 0.40, "gozyasi": 0.20}, "genre_ids": [10751, 18]},
    "ailecek":     {"mood_boost": {"battaniye": 0.40, "kahkaha": 0.25}, "genre_ids": [10751]},
    "klişe olma":  {"mood_boost": {"kalp": 0.40, "karmakar": 0.25},     "genre_ids": [18]},
    "klişe değil": {"mood_boost": {"kalp": 0.40, "karmakar": 0.25},     "genre_ids": [18]},
    "sıradan olma":{"mood_boost": {"kalp": 0.35, "karmakar": 0.25},     "genre_ids": [18]},
    "yaşlılık":    {"mood_boost": {"gozyasi": 0.35, "sessiz": 0.25},    "genre_ids": [18]},
    "arkadaşlarla":{"mood_boost": {"kahkaha": 0.45, "adrenalin": 0.20}, "genre_ids": [35]},
    "arkadaşımla": {"mood_boost": {"kahkaha": 0.40, "adrenalin": 0.20}, "genre_ids": [35]},
    "yalnız":      {"mood_boost": {"sessiz": 0.35, "geceyarisi-itirafi": 0.30}, "genre_ids": [18]},
    "yalnızken":   {"mood_boost": {"sessiz": 0.35, "geceyarisi-itirafi": 0.30}, "genre_ids": [18]},
    "tek başıma":  {"mood_boost": {"sessiz": 0.30, "geceyarisi-itirafi": 0.25}, "genre_ids": [18]},

    # Duygusal ifadeler
    "ağlatacak":   {"mood_boost": {"gozyasi": 0.50},                    "genre_ids": [18, 10749]},
    "ağlamak":     {"mood_boost": {"gozyasi": 0.45},                    "genre_ids": [18]},
    "güldürecek":  {"mood_boost": {"kahkaha": 0.50},                    "genre_ids": [35]},
    "kahkaha":     {"mood_boost": {"kahkaha": 0.45},                    "genre_ids": [35]},
    "rahatlatıcı": {"mood_boost": {"battaniye": 0.45},                  "genre_ids": [35, 10749]},
    "rahatlat":    {"mood_boost": {"battaniye": 0.40},                   "genre_ids": [35, 10749]},
    "düşündürecek":{"mood_boost": {"zihin": 0.45, "geceyarisi-itirafi": 0.20}, "genre_ids": [18]},
    "düşündürücü": {"mood_boost": {"zihin": 0.45},                      "genre_ids": [18]},
    "heyecanlı":   {"mood_boost": {"adrenalin": 0.40},                  "genre_ids": [28, 53]},
    "macera":      {"mood_boost": {"yolculuk": 0.45, "adrenalin": 0.20},"genre_ids": [12, 28]},
    "keşif":       {"mood_boost": {"yolculuk": 0.40},                   "genre_ids": [12]},

    # Üretim / köken
    "türk filmi":  {"mood_boost": {"kalp": 0.30},                       "genre_ids": [18]},
    "yerli":       {"mood_boost": {"kalp": 0.25},                       "genre_ids": [18]},
    "hollywood olma": {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.20}, "genre_ids": [18]},
    "hollywood değil": {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.20}, "genre_ids": [18]},
    "amerikan değil": {"mood_boost": {"kalp": 0.35},                    "genre_ids": [18]},
    "şiddet içermesin": {"mood_boost": {"battaniye": 0.40},             "genre_ids": [10751, 35]},
    "şiddet olmasın": {"mood_boost": {"battaniye": 0.40},               "genre_ids": [10751, 35]},
    "şiddetsiz":   {"mood_boost": {"battaniye": 0.35},                  "genre_ids": [10751, 35]},

    # ── Görsel tarz ──
    "siyah beyaz": {"mood_boost": {"sessiz": 0.35, "gece": 0.25},       "genre_ids": []},
    "siyahbeyaz":  {"mood_boost": {"sessiz": 0.35, "gece": 0.25},       "genre_ids": []},
    "monokrom":    {"mood_boost": {"sessiz": 0.35, "gece": 0.20},       "genre_ids": []},
    "tek plan":    {"mood_boost": {"zihin": 0.30, "sessiz": 0.20},      "genre_ids": []},
    "el kamerası": {"mood_boost": {"adrenalin": 0.30, "gercekci": 0.25},"genre_ids": []},
    "buluntu":     {"mood_boost": {"adrenalin": 0.30, "gercekci": 0.20},"genre_ids": [27]},
    "bağımsız":    {"mood_boost": {"kalp": 0.40, "sessiz": 0.20},       "genre_ids": [18]},
    "festival":    {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.25}, "genre_ids": [18]},
    "belgesel":    {"mood_boost": {"sessiz": 0.30, "zihin": 0.20},      "genre_ids": [99]},

    # Estetik / deneysel
    "sürreal":     {"mood_boost": {"karmakar": 0.50},                   "genre_ids": [14]},
    "deneysel":    {"mood_boost": {"karmakar": 0.45, "kadraj-estetigi": 0.25}, "genre_ids": []},
    "görsel":      {"mood_boost": {"kadraj-estetigi": 0.45},            "genre_ids": []},
    "sinematografi":{"mood_boost": {"kadraj-estetigi": 0.50},           "genre_ids": []},
    "estetik":     {"mood_boost": {"kadraj-estetigi": 0.45},            "genre_ids": []},
    "retro":       {"mood_boost": {"zamanyolcusu": 0.40},               "genre_ids": []},
    "klasik":      {"mood_boost": {"zamanyolcusu": 0.40},               "genre_ids": []},

    # ── Psikolojik temalar ───────────────────────────────────────────────────
    "delilik":     {"mood_boost": {"zihin": 0.45, "deep-chills": 0.30}, "genre_ids": [18, 53]},
    "çöküş":       {"mood_boost": {"zihin": 0.40, "deep-chills": 0.30}, "genre_ids": [18]},
    "paranoya":    {"mood_boost": {"deep-chills": 0.45, "zihin": 0.30}, "genre_ids": [53]},
    "travma":      {"mood_boost": {"gozyasi": 0.35, "zihin": 0.30},     "genre_ids": [18]},
    "psikopat":    {"mood_boost": {"deep-chills": 0.50, "gece": 0.30},  "genre_ids": [53, 80]},
    "şizofreni":   {"mood_boost": {"zihin": 0.50, "deep-chills": 0.25}, "genre_ids": [18, 53]},
    "obsesyon":    {"mood_boost": {"zihin": 0.40, "deep-chills": 0.30}, "genre_ids": [18, 53]},
    "psikolojik":  {"mood_boost": {"zihin": 0.45, "deep-chills": 0.25}, "genre_ids": [53, 18], "tmdb_keywords": ["9727", "157733"]},

    # ── Plot yapısı / anlatım ────────────────────────────────────────────────
    "ters köşe":   {"mood_boost": {"zihin": 0.50, "adrenalin": 0.20},   "genre_ids": [53, 9648], "tmdb_keywords": ["9991"]},  # plot twist
    "twist":       {"mood_boost": {"zihin": 0.50, "adrenalin": 0.20},   "genre_ids": [53, 9648], "tmdb_keywords": ["9991"]},
    "sürpriz son": {"mood_boost": {"zihin": 0.45, "adrenalin": 0.20},   "genre_ids": [53, 9648]},
    "açık uçlu":   {"mood_boost": {"zihin": 0.40, "geceyarisi-itirafi": 0.25}, "genre_ids": [18]},
    "zaman atlama":{"mood_boost": {"zihin": 0.40, "karmakar": 0.30},    "genre_ids": [878, 18]},

    # ── İlişki / karakter dinamikleri ────────────────────────────────────────
    "toksik ilişki":{"mood_boost": {"deep-chills": 0.35, "gozyasi": 0.25}, "genre_ids": [18]},
    "yasak aşk":   {"mood_boost": {"askbahcesi": 0.40, "gozyasi": 0.30}, "genre_ids": [10749, 18]},
    "intikam":     {"mood_boost": {"adrenalin": 0.45, "gece": 0.25},     "genre_ids": [53, 80]},
    "antihero":    {"mood_boost": {"gece": 0.40, "zihin": 0.25},         "genre_ids": [80, 18]},
    "anti kahraman":{"mood_boost": {"gece": 0.40, "zihin": 0.25},        "genre_ids": [80, 18]},

    # ── Mekan / atmosfer ─────────────────────────────────────────────────────
    "taşra":       {"mood_boost": {"sessiz": 0.40, "kalp": 0.30},        "genre_ids": [18]},
    "kasaba":      {"mood_boost": {"sessiz": 0.35, "kalp": 0.25},        "genre_ids": [18]},
    "anadolu":     {"mood_boost": {"sessiz": 0.40, "kalp": 0.30},        "genre_ids": [18]},
    "metropol":    {"mood_boost": {"gece": 0.35, "karmakar": 0.25},      "genre_ids": [18, 80]},
    "kasvet":      {"mood_boost": {"deep-chills": 0.40, "sessiz": 0.25}, "genre_ids": [18]},
    "loş":         {"mood_boost": {"gece": 0.40, "deep-chills": 0.25},   "genre_ids": [18]},

    # ── Tempo / izleme tarzı ─────────────────────────────────────────────────
    "yavaş":       {"mood_boost": {"sessiz": 0.40, "kadraj-estetigi": 0.25}, "genre_ids": [18]},
    "tempo düşmeyen":{"mood_boost": {"adrenalin": 0.45},                  "genre_ids": [28, 53]},
    "hızlı tempolu":{"mood_boost": {"adrenalin": 0.40},                   "genre_ids": [28, 53]},
    "sıkmayacak":  {"mood_boost": {"adrenalin": 0.30, "kahkaha": 0.25},   "genre_ids": [28, 35]},
    "temposu hiç düşmeyen":{"mood_boost": {"adrenalin": 0.50},            "genre_ids": [28, 53]},

    # ── Gurme / kült / festival sinyalleri ───────────────────────────────────
    "kült":        {"mood_boost": {"karmakar": 0.40, "zihin": 0.25},      "genre_ids": [],    "tmdb_keywords": ["9951"]},
    "az bilinen":  {"mood_boost": {"karmakar": 0.35, "kalp": 0.25},       "genre_ids": [],    "tmdb_keywords": ["9951"]},
    "değeri bilinmeyen":{"mood_boost": {"karmakar": 0.40, "kalp": 0.25},  "genre_ids": [],    "tmdb_keywords": ["9951"]},
    "ödüllü":      {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.25},"genre_ids": [18]},

    # ── Girişimcilik / iş dünyası ────────────────────────────────────────────
    "girişimcilik":{"mood_boost": {"zihin": 0.35, "adrenalin": 0.25},     "genre_ids": [18]},
    "wall street": {"mood_boost": {"adrenalin": 0.35, "gece": 0.25},      "genre_ids": [80, 18]},
    "hırs":        {"mood_boost": {"adrenalin": 0.35, "gece": 0.25},      "genre_ids": [18, 80]},

    # ── Sinema akımları ──────────────────────────────────────────────────────
    "noir":        {"mood_boost": {"gece": 0.50, "deep-chills": 0.25},    "genre_ids": [80, 53], "tmdb_keywords": ["10250", "179430"]},  # film noir + neo-noir
    "indie":       {"mood_boost": {"kalp": 0.40, "sessiz": 0.25},         "genre_ids": [18]},
    "distopik":    {"mood_boost": {"zihin": 0.40, "deep-chills": 0.30},   "genre_ids": [878], "tmdb_keywords": ["4565"]},   # dystopia
    "distopya":    {"mood_boost": {"zihin": 0.40, "deep-chills": 0.30},   "genre_ids": [878], "tmdb_keywords": ["4565"]},
    "sanat filmi": {"mood_boost": {"kadraj-estetigi": 0.45, "sessiz": 0.25}, "genre_ids": [18]},
    # ── Tema/tür eklemeleri ──
    "tarih":       {"mood_boost": {"zamanyolcusu": 0.40, "gozyasi": 0.20}, "genre_ids": [36]},
    "western":     {"mood_boost": {"zamanyolcusu": 0.40, "yolculuk": 0.20}, "genre_ids": [37]},
    "kovboy":      {"mood_boost": {"zamanyolcusu": 0.40, "yolculuk": 0.20}, "genre_ids": [37]},
    "fantazi":     {"mood_boost": {"karmakar": 0.40},                       "genre_ids": [14]},
    "gençlik":     {"mood_boost": {"kahkaha": 0.30, "askbahcesi": 0.25},    "genre_ids": []},
    "spor":        {"mood_boost": {"adrenalin": 0.40, "yolculuk": 0.20},    "genre_ids": []},
    "korku komedi":{"mood_boost": {"karmakar": 0.35, "kahkaha": 0.35},      "genre_ids": [35, 27]},
    "oscar":       {"mood_boost": {"kalp": 0.25, "zihin": 0.15},            "genre_ids": []},
    "gişe rekoru": {"mood_boost": {"adrenalin": 0.35, "gece": 0.25},        "genre_ids": [28, 12]},

    # ── İngilizce sıfat/ifade köprüleri (serbest İngilizce sorgular) ──────────
    "witty":       {"mood_boost": {"kahkaha": 0.40, "zihin": 0.20},         "genre_ids": [35]},
    "feel good":   {"mood_boost": {"battaniye": 0.45, "kahkaha": 0.20},     "genre_ids": [35, 10751]},
    "feel-good":   {"mood_boost": {"battaniye": 0.45, "kahkaha": 0.20},     "genre_ids": [35, 10751]},
    "heartwarming":{"mood_boost": {"battaniye": 0.40, "gozyasi": 0.20},     "genre_ids": [18, 10751]},
    "uplifting":   {"mood_boost": {"battaniye": 0.40, "kahkaha": 0.20},     "genre_ids": [18]},
    "dark":        {"mood_boost": {"gece": 0.40, "deep-chills": 0.25},      "genre_ids": [80, 53]},
    "gritty":      {"mood_boost": {"gece": 0.40, "gercekci": 0.25},         "genre_ids": [80, 18]},
    "gripping":    {"mood_boost": {"adrenalin": 0.40, "gece": 0.20},        "genre_ids": [53]},
    "suspenseful": {"mood_boost": {"gece": 0.40, "adrenalin": 0.25},        "genre_ids": [53]},
    "slow burn":   {"mood_boost": {"sessiz": 0.40, "gece": 0.25},           "genre_ids": [18, 53]},
    "thought provoking": {"mood_boost": {"zihin": 0.45},                    "genre_ids": [18]},
    "thought-provoking": {"mood_boost": {"zihin": 0.45},                    "genre_ids": [18]},
    "art house":   {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.25},  "genre_ids": [18]},
    "arthouse":    {"mood_boost": {"kalp": 0.40, "kadraj-estetigi": 0.25},  "genre_ids": [18]},
    "cozy":        {"mood_boost": {"battaniye": 0.45},                      "genre_ids": [35, 10751]},
    "wholesome":   {"mood_boost": {"battaniye": 0.40, "kahkaha": 0.15},     "genre_ids": [10751, 35]},
    "mind bending":{"mood_boost": {"zihin": 0.50, "karmakar": 0.25},        "genre_ids": [878, 53]},
    "mind-bending":{"mood_boost": {"zihin": 0.50, "karmakar": 0.25},        "genre_ids": [878, 53]},
    "tearjerker":  {"mood_boost": {"gozyasi": 0.50},                        "genre_ids": [18]},
    "heist":       {"mood_boost": {"adrenalin": 0.40, "gece": 0.25},        "genre_ids": [80, 53]},
}


class ParsedHints:
    """
    Embedding öncesi chat metninden çıkarılan hafif sinyaller.
    Hybrid re-ranking'de cosine skoru ile harmanlanır.
    """
    __slots__ = ("sipsak_mode", "runtime_max", "mood_bonuses", "genre_ids",
                 "hidden_gem_mode", "tmdb_keywords")

    def __init__(self) -> None:
        self.sipsak_mode:     bool              = False
        self.runtime_max:     Optional[int]     = None
        self.mood_bonuses:    dict[str, float]  = {}   # mood_id → bonus (0.0-0.40)
        self.genre_ids:       list[int]         = []   # TMDB tür ID'leri
        self.hidden_gem_mode: bool              = False
        self.tmdb_keywords:   list[str]         = []   # TMDB keyword ID'leri (pipe ile birleştirilir)

    def has_signals(self) -> bool:
        return self.sipsak_mode or bool(self.mood_bonuses) or bool(self.genre_ids) or self.hidden_gem_mode


_HIDDEN_GEM_KWS = [
    "kült", "gizli", "az bilinen", "değeri bilinmeyen", "saklı",
    "keşfedilmemiş", "underrated", "bilinmeyen", "kimsenin bilmediği",
    "popüler olmayan", "mainstream dışı", "herkesin kaçırdığı",
    "gizli kalmış",
]


# Olumsuzlama ipuçları — bir anahtar kelimenin reddedildiğini gösterir
# ("korku olmasın", "erotik istemiyorum", "şehvet içermesin", "komik değil").
_NEG_AFTER = ("olmasın", "olmasin", "istemiyorum", "istemem", "içermesin",
              "icermesin", "yok", "hariç", "haric", "değil", "degil", "istemiyom")
_NEG_BEFORE = ("hariç", "haric", "olmadan", "dışında", "disinda")


def _kw_is_negated(text_lower: str, kw: str) -> bool:
    """kw anahtar kelimesi metinde olumsuzlanmış mı? ('erotik olmasın' → True).
    kw'den SONRA ~20 karakter içinde olumsuzluk eki ya da ÖNCE 'hariç/olmadan'."""
    idx = text_lower.find(kw)
    if idx < 0:
        return False
    after = text_lower[idx + len(kw): idx + len(kw) + 22]
    if any(nc in after for nc in _NEG_AFTER):
        return True
    before = text_lower[max(0, idx - 14): idx]
    if any(nc in before for nc in _NEG_BEFORE):
        return True
    return False


def parse_chat_hints(text: str) -> ParsedHints:
    """
    Chat metnini embedding modeline göndermeden önce hafif string analizinden geçir.
    Süre kısıtları, tür ve tema anahtar kelimeleri yakalanarak bonus sinyaller üretilir.
    Hiçbir zaman exception fırlatmaz — her zaman geçerli ParsedHints döndürür.
    """
    hints = ParsedHints()
    tl = text.lower()

    # ── Süre kısıtı — dakika bazlı ayrıştırma ───────────────────────────────
    time_c = _extract_time_constraint(text)
    if time_c:
        if time_c["mode"] == "short":
            hints.sipsak_mode = True
            hints.runtime_max = time_c.get("max_minutes") or 100
            hints.mood_bonuses["sipsak"] = _MAX_BONUS
    else:
        for kw in _TIME_CONSTRAINT_KWS:
            if kw in tl:
                hints.sipsak_mode = True
                hints.runtime_max = 100
                hints.mood_bonuses["sipsak"] = _MAX_BONUS
                break

    # ── Kategori/tema anahtar kelimeleri → mood/tür bonus ────────────────────
    for kw, data in _CATEGORY_HINT_MAP.items():
        if kw in tl:
            # Olumsuzlanmışsa ("korku olmasın", "erotik istemiyorum") pozitif
            # boost'u UYGULAMA — yanlış mood/tür sinyalini engelle.
            if _kw_is_negated(tl, kw):
                continue
            for mood_id, bonus in data["mood_boost"].items():
                current = hints.mood_bonuses.get(mood_id, 0.0)
                hints.mood_bonuses[mood_id] = min(_MAX_BONUS, current + bonus)
            hints.genre_ids.extend(data["genre_ids"])
            hints.tmdb_keywords.extend(data.get("tmdb_keywords", []))

    # ── Hidden gem / kült modu ───────────────────────────────────────────────
    for kw in _HIDDEN_GEM_KWS:
        if kw in tl:
            hints.hidden_gem_mode = True
            break

    hints.genre_ids    = list(set(hints.genre_ids))
    hints.tmdb_keywords = list(set(hints.tmdb_keywords))
    return hints
