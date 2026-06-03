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
    r"(.+?)\s*ayarında\b",
    r"(.+?)\s*tarzında\b",
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
}


# ═══════════════════════════════════════════════════════════════
# STREAMING PLATFORMS — provider_filter intent tespiti için
# ═══════════════════════════════════════════════════════════════
STREAMING_PLATFORMS = {
    "netflix":       {"aliases": ["netflix", "netflixde", "netflix'te", "netflixte"], "provider_id": 8},
    "amazon prime":  {"aliases": ["amazon prime", "prime video", "amazonda", "prime"], "provider_id": 9},
    "disney+":       {"aliases": ["disney", "disney+"], "provider_id": 337},
    "mubi":          {"aliases": ["mubi", "mubi'de"], "provider_id": 11},
    "blutv":         {"aliases": ["blutv", "blu tv"], "provider_id": 69},
    "exxen":         {"aliases": ["exxen", "exxen'de"], "provider_id": 514},
    "apple tv":      {"aliases": ["apple tv", "appletv"], "provider_id": 350},
    "hbo max":       {"aliases": ["hbo", "max", "hbo max"], "provider_id": 384},
    "paramount+":    {"aliases": ["paramount", "paramount+"], "provider_id": 531},
    "tabii":         {"aliases": ["tabii"], "provider_id": 618},
    "gain":          {"aliases": ["gain"], "provider_id": 553},
}

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

NEGATIVE_WORDS = [
    "olmasın", "istemiyorum", "değil", "hariç", "dışında", "yok",
    "olmadan", "kaçının", "uzak", "ama", "fakat",
]

# İçerik bazlı reddetme: tür adı geçmeden "şiddet/kan/korkutma" gibi içerik
# kısıtları → ilgili türleri hariç tut. (phrase → exclude genre_ids)
_CONTENT_NEGATION = {
    "şiddet içermesin": [27, 53, 10752, 80], "şiddet olmasın": [27, 53, 10752, 80],
    "şiddetsiz": [27, 53, 10752, 80], "kan olmasın": [27, 53], "kanlı olmasın": [27, 53],
    "korkutmasın": [27], "ürkütmesin": [27], "korkutucu olmasın": [27],
    "ağlatmasın": [],  # tür değil, mood ile ele alınır
    "ağır olmasın": [], "kasvetli olmasın": [],
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

# "ama/fakat" ile ayrılmış karmaşık cümlelerde negation tespiti
_CLAUSE_SPLITTER = re.compile(r"\b(?:ama|fakat|ancak|lakin|yalnız)\b", re.IGNORECASE)


def _normalize(text: str) -> str:
    if not text:
        return ""
    t = text.strip().lower()
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _fuzzy_match(s1: str, s2: str) -> float:
    return SequenceMatcher(None, _normalize(s1), _normalize(s2)).ratio()


_TR_FOLD = str.maketrans("çğıöşü", "cgiosu")


def _fold(text: str) -> str:
    """Türkçe aksanları katlayıp normalize eder (hem aksanlı hem ASCII girişi yakalar)."""
    return _normalize(text).translate(_TR_FOLD)


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
    if any(gw in text_lower for gw in GENRE_KEYWORDS):
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
}

# Türkçe fiil/ek sonları — kişi adları (neredeyse) hiç bu eklerle bitmez.
# "maz/mez" (Yılmaz), "sin/sın" (Muhsin) bilinçli DIŞARIDA — gerçek soyadlarını bozar.
_NAME_VERB_SUFFIXES = (
    "yorum", "yoruz", "iyor", "ıyor", "uyor", "üyor",
    "dım", "dim", "dum", "düm", "tım", "tim", "tüm", "tum",
    "mak", "mek", "ecek", "acak", "yacak", "yecek",
    "miş", "muş", "mış", "müş", "ması", "mesi",
    "makta", "mekte", "malı", "meli", "masin", "mesin",
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
        if gw in nl:
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


# ═══════════════════════════════════════════════════════════════
# INTENT RESULT
# ═══════════════════════════════════════════════════════════════
class Intent:
    def __init__(self, intent_type: str, **kwargs):
        self.type = intent_type
        self.reference_title = kwargs.get("reference_title", None)
        self.person_name = kwargs.get("person_name", None)
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
}


def _parse_complex_negation(text: str) -> tuple[list[int], list[int]]:
    """"ama/fakat" ile bölünmüş cümlelerde ayrı ayrı tür include/exclude çıkar.
    İlk cümle ana istek, "ama" sonrası olumsuz türleri barındırır.
    Örn: "korku değil ama gerilim olabilir" → exclude=[27], include=[53]."""
    t = text.lower().strip()
    clauses = _CLAUSE_SPLITTER.split(t, maxsplit=1)
    main_clause = clauses[0].strip()
    # Önce tüm metinden exclude'ları topla
    all_exclude = []
    for gname, gids in GENRE_KEYWORDS.items():
        if gname in t:
            before_idx = t.index(gname)
            before_text = t[max(0, before_idx - 30):before_idx]
            if any(nw in before_text for nw in ("olmasın", "istemiyorum", "değil", "hariç", "dışında")):
                all_exclude.extend(gids)
    # "ama" sonrası varsa, oradaki türleri include'a ekle
    more_include = []
    if len(clauses) > 1:
        after = clauses[1].strip()
        for gname, gids in GENRE_KEYWORDS.items():
            if gname in after:
                after_idx = after.index(gname)
                after_before = after[max(0, after_idx - 15):after_idx]
                if not any(nw in after_before for nw in ("olmasın", "istemiyorum", "değil", "hariç")):
                    more_include.extend(gids)
    # Ana clause'taki türlerden exclude'ları çıkar
    main_include = []
    for gname, gids in GENRE_KEYWORDS.items():
        if gname in main_clause:
            before_idx = main_clause.index(gname)
            before_text = main_clause[max(0, before_idx - 15):before_idx]
            if not any(nw in before_text for nw in ("olmasın", "istemiyorum", "değil", "hariç")):
                main_include.extend(gids)
    return list(set(main_include + more_include)), list(set(all_exclude))


def _rule_based_confused_analysis(text: str) -> dict:
    """Local rule-based mood analysis — zero API calls, <1ms.
    Uzun metinlerden mood, süre kısıtı, dönem tercihi ve tür ipuçlarını çıkarır.
    """
    text_lower = text.lower().strip()
    scored = {}
    for triggers, mood_id in _RULE_MOOD_MAP.items():
        score = sum(2 for t in triggers if t in text_lower)
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
    # Dil filtresi
    lang_filter = None
    for phrase, code in LANGUAGE_KEYWORDS.items():
        if phrase in text_lower:
            lang_filter = code
            break

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
    """Metinde streaming platform adı geçiyor mu? Varsa normalized key döndür."""
    tl = text.lower()
    for key, info in STREAMING_PLATFORMS.items():
        for alias in info["aliases"]:
            if alias in tl:
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
    """Metinde dil/ülke adı geçiyorsa ISO kodu döndür."""
    tl = text.lower()
    for phrase, code in LANGUAGE_KEYWORDS.items():
        if phrase in tl:
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
        text_lower = text.lower().strip()
        text_norm = _normalize(text)

        # ── Önce feedback ──
        for pattern, fb_type in FEEDBACK_PATTERNS.items():
            if pattern in text_lower:
                return Intent("feedback", feedback_type=fb_type, original_text=text)

        # ── Platform filter (text'te streaming platform adı geçiyorsa) ──
        platform_filter = _detect_platform_filter(text)

        # ── Yönetmen keyword'leri (yüksek güven) ──
        for kw in DIRECTOR_KEYWORDS:
            if kw in text_lower:
                idx = text_lower.index(kw)
                person_name = text[:idx].strip().strip('"\'')
                if person_name and _is_plausible_person_name(person_name, allow_single=True):
                    # intent belirlendikten sonra cross-signal'lar toplanır
                    era_c, time_c, g_hints, ex_g_hints = _collect_signals(text)
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
                if person_name and _is_plausible_person_name(person_name, allow_single=True):
                    era_c, time_c, g_hints, ex_g_hints = _collect_signals(text)
                    return Intent("actor_recommendation", person_name=person_name,
                                  person_type="actor", original_text=text,
                                  platform_filter=platform_filter,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints,
                                  mood_signals=_rule_based_confused_analysis(text).get("mood_mix", []),
                                  lang_filter=_detect_lang_filter(text))

        # ── Similar-to patterns ("X gibi", "X tarzı") — GUARD: mood phrase'i yakalama ──
        for pat in SIMILAR_PATTERNS:
            m = re.search(pat, text_lower)
            if m:
                ref_title = m.group(1).strip().strip('"\'')
                if len(ref_title) >= 2:
                    # Guard: referans kısa ve mood phrase'i andırıyorsa atla
                    ref_norm = _normalize(ref_title)
                    if len(ref_norm.split()) <= 2 and any(mp in ref_norm for mp in ("bir şey", "birsey", "şey", "film", "sey", "bisey")):
                        break
                    alias_check = ref_norm
                    if alias_check in TURKISH_TITLE_ALIASES:
                        ref_title = TURKISH_TITLE_ALIASES[alias_check]
                    era_c, time_c, g_hints, ex_g_hints = _collect_signals(text)
                    return Intent("similar_to_movie", reference_title=ref_title, original_text=text,
                                  platform_filter=platform_filter,
                                  era_constraint=era_c, time_constraint=time_c,
                                  genres=g_hints, exclude_genres=ex_g_hints)

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
        for genre_name, genre_ids in GENRE_KEYWORDS.items():
            if genre_name in text_lower:
                pos = text_lower.index(genre_name)
                before = text_lower[max(0, pos - 20):pos]
                is_negative = any(nw in before for nw in NEGATIVE_WORDS)
                if is_negative:
                    genres_excluded = list(set(genres_excluded + genre_ids))
                else:
                    genres_wanted = list(set(genres_wanted + genre_ids))

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
