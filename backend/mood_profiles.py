"""
Merkezi Mood Profil Sistemi
Her mood'un duygusal tanımı, film karakteri, uygun/uygunsuz türler, keyword ipuçları,
ton parametreleri ve popülerite politikasını içerir.
Hem MOOD_GENRE_MAP'i, mood_scoring'i hem de Claude promptlarını buradan besler.
"""

# TMDB Genre IDs:
# 28=Action, 12=Adventure, 16=Animation, 35=Comedy, 80=Crime, 99=Documentary,
# 18=Drama, 10751=Family, 14=Fantasy, 36=History, 27=Horror, 10402=Music,
# 9648=Mystery, 10749=Romance, 878=Science Fiction, 53=Thriller,
# 10752=War, 37=Western, 10770=TV Movie

# TMDB Keyword IDs (known):
# 10183=independent film, 3475=art house, 210024=psychological horror,
# 210021=supernatural horror, 255313=folk horror, 9727=atmospheric,
# 12377=slow burn, 251417=slow-burn horror, 9672=road trip,
# 161384=coming of age, 158718=time travel, 191480=mind-bending,
# 9951=cult film, 179430=neo-noir, 10024=detective, 14544=murder mystery,
# 157733=psychological thriller, 170339=nostalgic, 207317=comedy,
# 187739=adventure, 189561=dark comedy, 10250=film noir,
# 207268=sci-fi horror, 3405=romance, 157763=historical fiction,
# 161248=period drama, 12315=biography, 152334=survival,
# 9882=chase, 414=fantasy, 9736=satire, 185428=retro,
# 3045=1980s, 208992=neon, 158385=cyberpunk,
# 193504=supernatural thriller, 235648=existential,
# 183967=meditation, 978=haunting, 317=experimental,
# 10535=surrealism, 153850=slow cinema, 1562=thriller,
# 207259=musical, 9888=drama

MOOD_PROFILES = {
    "battaniye": {
        "title": "Battaniye Modu",
        "music_style": "Lo-Fi & Coffee Shop Jazz",
        "description": "Dışarıda yağmur yağıyor, elinde sıcak bir çay var ve pijamalarını giydin.",
        "intent": "Cozy, sıcak, güvenli, rahat. Feel-good, aile, yumuşak komedi, tatlı romantik, sıcak dram. Kullanıcıyı yormayan, korkutmayan, germeyen filmler.",
        "positive_genres": [10751, 35, 18, 10749, 16, 10402],
        "negative_genres": [27, 53, 80, 28, 10752, 9648],
        "positive_keywords": ["cozy", "warm", "family", "home", "comfort", "heartwarming", "feel-good", "gentle", "soft",
                              "friendship", "reunion", "holiday", "christmas", "childhood", "puppy", "dog", "cat",
                              "cooking", "bakery", "garden", "village", "grandmother", "grandfather", "healing",
                              # Türkçe keywords (filmler TR overview'a sahip)
                              "aile", "ev", "sıcak", "arkadaş", "dostluk", "çocuk", "bayram", "noel", "tatil",
                              "köy", "anne", "baba", "büyükanne", "mutlu", "sevgi", "şefkat", "yardım", "komşu",
                              "oyun", "eğlence", "gülümse", "umut", "barış", "huzur"],
        "negative_keywords": ["dark", "violent", "horror", "war", "brutal", "psychological", "disturbing", "gore", "crime",
                              "murder", "serial killer", "torture", "nightmare", "blood", "death", "revenge", "apocalypse",
                              "mafia", "gangster", "corruption", "prison", "heist", "cartel", "conspiracy", "dystopia",
                              "class conflict", "betrayal", "assassination", "kidnapping",
                              # Türkçe negatifler
                              "cinayet", "katil", "korku", "savaş", "şiddet", "kan", "ölüm", "intikam", "kabus",
                              "mafya", "hapishane", "işkence", "kaçırma", "terör"],
        "tone": {
            "atmosphere": "warm",
            "tempo": "slow_to_medium",
            "film_type": "mainstream_and_indie",
            "dark_light": "light",
            "romance_thriller": 0.3,
            "nostalgia": 0.5,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "27,53,80,10752",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "yolculuk": {
        "title": "Yolculuk Ruhu",
        "music_style": "Indie Folk & Akustik Gitar",
        "description": "Bilinmeyen diyarlara, hiç görmediğin sokaklara, rüzgarın götürdüğü yere...",
        "intent": "Keşif, yol, macera, büyüme hikayesi, yeni yerler. Road movie, adventure, fantasy journey, uzak coğrafya, doğa, harita, ufuk.",
        "positive_genres": [12, 14, 878, 28, 10752, 18, 37, 99],
        "negative_genres": [27, 9648, 10749],
        "positive_keywords": ["journey", "road trip", "adventure", "expedition", "travel", "wilderness", "exploration", "quest", "voyage",
                              "mountain", "ocean", "desert", "forest", "island", "backpack", "discover", "horizon", "freedom",
                              "nature", "survival", "escape", "wanderer", "nomad", "tribe", "expedition", "frontier",
                              # Türkçe
                              "yolculuk", "macera", "keşif", "dağ", "okyanus", "çöl", "orman", "ada", "doğa",
                              "hayatta kalma", "kaçış", "ufuk", "özgürlük", "gemi", "uçak", "tren", "yol"],
        "negative_keywords": ["haunted", "detective", "closed room", "prison", "romantic comedy", "serial killer",
                              "office", "courtroom", "hospital", "school", "suburban", "apartment",
                              "dedektif", "hapishane", "mahkeme", "hastane", "okul"],
        "tone": {
            "atmosphere": "adventurous",
            "tempo": "medium",
            "film_type": "mainstream_and_indie",
            "dark_light": "balanced",
            "romance_thriller": 0.2,
            "nostalgia": 0.3,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "27,9648,10749",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "gece": {
        "title": "Gece Kuşu",
        "music_style": "Synthwave & Dark Ambient",
        "description": "Herkes uyudu ama sen uyumadın. Gece sessizliğinde, karanlıkta parlayan ekranla baş başa.",
        "intent": "Gece, karanlık şehir, suç, gizem, thriller, noir hissi. Uykusuzluk, yalnızlık, sokak lambası, neon, karanlık ekran atmosferi.",
        "positive_genres": [53, 9648, 80, 27, 28, 18],
        "negative_genres": [10749, 35, 10751, 16, 10402],
        "positive_keywords": ["noir", "detective", "murder mystery", "crime", "investigation", "thriller", "neo-noir", "night", "dark city",
                              "underworld", "mafia", "gangster", "heist", "corrupt", "conspiracy", "fugitive", "hitman",
                              "assassin", "interrogation", "witness", "suspect", "forensic", "shadow", "neon",
                              # Türkçe
                              "gece", "karanlık", "suç", "cinayet", "dedektif", "soruşturma", "mafya", "soygun",
                              "kaçak", "suikast", "tanık", "şüpheli", "yeraltı", "gölge", "polis", "uyuşturucu"],
        "negative_keywords": ["romantic comedy", "musical", "family", "animation", "feel-good", "comedy",
                              "fairy tale", "cartoon", "christmas", "wedding", "puppy", "children",
                              "romantik komedi", "müzikal", "aile", "animasyon", "çocuk", "düğün"],
        "tone": {
            "atmosphere": "dark",
            "tempo": "medium_to_fast",
            "film_type": "mainstream_and_indie",
            "dark_light": "dark",
            "romance_thriller": 0.8,
            "nostalgia": 0.2,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "10749,35,10751,16,10402",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "kahkaha": {
        "title": "Kahkaha Molası",
        "music_style": "Upbeat Funk & Swing",
        "description": "Hayat zaten yeterince ciddi. Bugün sadece gülmek, kıkırdamak ve o güzel rahatlamayı hissetmek için.",
        "intent": "Hafif, eğlenceli, komik, hızlı rahatlatan. Live-action komedi öncelikli. Absürt komedi, buddy comedy, feel-good comedy.",
        "positive_genres": [35, 10402, 10751, 18, 80],
        "negative_genres": [27, 53, 10752, 9648, 16],
        "positive_keywords": ["comedy", "funny", "hilarious", "laugh", "satire", "parody", "stand-up", "slapstick", "buddy comedy",
                              "prank", "absurd", "farce", "wit", "humor", "joke", "gag", "ridiculous", "chaos",
                              "misunderstanding", "awkward", "embarrassment", "drunk", "party", "bachelor",
                              # Türkçe
                              "komedi", "komik", "gülmek", "kahkaha", "espri", "şaka", "absürt", "parti",
                              "yanlış anlama", "sarhoş", "kaos", "saçma", "eğlenceli", "mizah"],
        "negative_keywords": ["horror", "war", "tragedy", "animation", "psychological", "depression", "death",
                              "grief", "cancer", "funeral", "suicide", "torture", "genocide", "slavery",
                              "korku", "savaş", "trajedi", "animasyon", "psikolojik", "depresyon", "ölüm", "cenaze"],
        "tone": {
            "atmosphere": "fun",
            "tempo": "fast",
            "film_type": "live_action",
            "dark_light": "light",
            "romance_thriller": 0.1,
            "nostalgia": 0.2,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "27,53,10752,9648,16",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "gozyasi": {
        "title": "Gözyaşı Gecesi",
        "music_style": "Neoklasik Cello & Piyano",
        "description": "Bazen ağlamak iyi gelir. İçindeki o düğümü çözecek, ruhunu yıkayıp arındıracak filmler.",
        "intent": "Duygusal yoğunluk, kayıp, özlem, aşk acısı, aile dramı, savaş dramı. Ağlatan ama anlamlı filmler. Katarsis hissi.",
        "positive_genres": [18, 10749, 10752, 36, 99],
        "negative_genres": [35, 28, 878, 27, 80, 9648],
        "positive_keywords": ["tearjerker", "emotional", "heartbreaking", "loss", "grief", "love story", "sad", "moving", "touching", "family drama",
                              "dying", "farewell", "sacrifice", "orphan", "widow", "cancer", "alzheimer", "separation",
                              "longing", "nostalgia", "redemption", "forgiveness", "regret", "memorial", "eulogy",
                              # Türkçe
                              "duygusal", "hüzünlü", "kayıp", "acı", "ayrılık", "özlem", "gözyaşı", "veda",
                              "fedakarlık", "yetim", "dul", "kanser", "hastalık", "ölüm", "anı", "af", "pişmanlık",
                              "aşk", "sevgi", "hatıra", "nostalji", "kader"],
        "negative_keywords": ["comedy", "action", "horror", "sci-fi", "thriller", "funny", "lighthearted",
                              "slapstick", "parody", "farce", "absurd", "superhero", "robot", "alien invasion",
                              "komedi", "aksiyon", "korku", "bilim kurgu", "komik", "eğlenceli", "süper kahraman"],
        "tone": {
            "atmosphere": "melancholic",
            "tempo": "slow_to_medium",
            "film_type": "mainstream_and_indie",
            "dark_light": "balanced",
            "romance_thriller": 0.4,
            "nostalgia": 0.4,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "35,28,878,27,80,9648",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.5,
            "min_vote_count": 50,
        },
    },
    "adrenalin": {
        "title": "Adrenalin Patlaması",
        "music_style": "Cinematic Orchestral",
        "description": "Kalp atışın hızlansın, koltuğunun kenarını sımsıkı tut. Bugün seni yerinden fırlatacak filmler var.",
        "intent": "Aksiyon, hız, tehlike, yüksek gerilim, kovalamaca, savaş, hayatta kalma. Kullanıcıyı koltuğun kenarında tutmalı. Tempo önemli.",
        "positive_genres": [28, 53, 878, 80, 12, 10752, 27],
        "negative_genres": [18, 10749, 36, 99, 10751, 16],
        "positive_keywords": ["action", "chase", "survival", "thriller", "explosive", "fast-paced", "battle", "escape", "race", "war",
                              "gun", "fight", "martial arts", "combat", "helicopter", "bomb", "mission", "hostage",
                              "sniper", "commando", "mercenary", "soldier", "pursuit", "collision", "ambush",
                              # Türkçe
                              "aksiyon", "kovalamaca", "savaş", "silah", "dövüş", "patlama", "görev", "rehine",
                              "keskin nişancı", "asker", "kaçış", "çarpışma", "pusu", "tehlike", "hız"],
        "negative_keywords": ["slow", "drama", "romantic", "documentary", "biography", "family", "animation", "talk-heavy",
                              "meditation", "contemplative", "quiet", "gentle", "poetry", "philosophical",
                              "yavaş", "romantik", "belgesel", "aile", "animasyon", "şiir", "felsefe"],
        "tone": {
            "atmosphere": "intense",
            "tempo": "fast",
            "film_type": "mainstream",
            "dark_light": "balanced",
            "romance_thriller": 0.9,
            "nostalgia": 0.0,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "18,10749,36,99,10751,16,10402",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "askbahcesi": {
        "title": "Aşk Bahçesi",
        "music_style": "Fransız Chanson & Soft Pop",
        "description": "Kalbinin bir köşesinde hâlâ kelebekler uçuyor mu? O zaman gel, aşkın en güzel hallerini perdede birlikte yaşayalım.",
        "intent": "Romantik, sıcak, duygusal, zarif. Aşkın güzel, kırılgan, şiirsel, umutlu veya melankolik halleri. Rom-com olabilir ama duygu yoğunluğu da olmalı.",
        "positive_genres": [10749, 18, 35, 10402, 10751],
        "negative_genres": [27, 53, 80, 28, 878, 10752],
        "positive_keywords": ["romance", "love", "romantic", "passion", "relationship", "date", "heart", "kiss", "wedding", "couple",
                              "soulmate", "proposal", "letter", "dance", "embrace", "longing", "reunion", "destiny",
                              "affair", "jealousy", "devotion", "paris", "sunset", "rain", "flower",
                              # Türkçe
                              "aşk", "romantik", "tutku", "ilişki", "kalp", "öpücük", "düğün", "çift",
                              "ruh eşi", "evlenme teklifi", "mektup", "dans", "kucaklaşma", "özlem",
                              "kıskançlık", "sadakat", "gün batımı", "yağmur", "çiçek", "sevgili"],
        "negative_keywords": ["horror", "action", "war", "crime", "thriller", "gore", "violence", "serial killer",
                              "monster", "zombie", "alien", "robot", "explosion", "military", "battlefield",
                              "korku", "aksiyon", "savaş", "suç", "şiddet", "katil", "canavar", "patlama"],
        "tone": {
            "atmosphere": "romantic",
            "tempo": "medium",
            "film_type": "mainstream_and_indie",
            "dark_light": "light_to_balanced",
            "romance_thriller": 0.1,
            "nostalgia": 0.3,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "27,53,80,28,878,10752",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 50,
        },
    },
    "zamanyolcusu": {
        "title": "Zaman Yolcusu",
        "music_style": "Vintage Jazz & Gramofon",
        "description": "Eski projeksiyon makinelerinin sesi, solmuş biletler, sinema salonunun kadife koltukları... Geçmişe bir yolculuğa çıkalım.",
        "intent": "1990 ve öncesi klasik/vintage sinema hissi veren, eski film salonu atmosferini çağrıştıran, nostaljik ve dönem ruhu güçlü filmler.",
        "positive_genres": [36, 99, 18, 10752, 37, 10749, 35, 12, 80, 10751],
        "negative_genres": [878, 27, 28, 14, 53, 9648],
        "positive_keywords": ["classic", "vintage", "old hollywood", "golden age", "silent film", "black and white", "period", "archive", "nostalgia", "cinema history", "classic cinema", "yeşilçam", "gramophone", "projector", "old cinema", "western", "war", "historical", "period drama",
                              "empire", "kingdom", "dynasty", "revolution", "medieval", "ancient", "colonial", "costume",
                              "monarchy", "aristocrat", "nobleman", "sword", "chariot", "throne", "castle",
                              # Türkçe
                              "klasik", "eski", "nostaljik", "dönem", "tarih", "imparatorluk", "krallık",
                              "devrim", "ortaçağ", "antik", "kılıç", "kale", "savaş", "osmanlı",
                              "cumhuriyet", "padişah", "sultan", "saray"],
        "negative_keywords": ["neon", "arcade", "cyberpunk", "modern", "superhero", "cgi", "blockbuster sequel", "contemporary", "found footage", "sci-fi", "horror",
                              "social media", "internet", "smartphone", "app", "streaming", "influencer", "virtual reality",
                              "sosyal medya", "telefon", "bilgisayar", "internet"],
        "tone": {
            "atmosphere": "nostalgic",
            "tempo": "slow_to_medium",
            "film_type": "classic_cinema",
            "dark_light": "balanced",
            "romance_thriller": 0.2,
            "nostalgia": 1.0,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "878,27,28,14,53,9648",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.5,
            "min_vote_count": 100,
            "primary_release_date_lte": "1990-12-31",
        },
        "turkish_seed_params": {
            "min_vote_count": 30,
            "min_vote_average": 6.0,
            "primary_release_date_lte": "1990-12-31",
        },
    },
    "sessiz": {
        "title": "Sessiz Yolculuk",
        "music_style": "Ambient & Minimalist",
        "description": "Bazen kelimeler yetersiz kalır. Sadece görüntülerin, seslerin ve sessizliğin konuştuğu filmler için.",
        "intent": "Minimal, sakin, meditatif, yavaş tempo. Görsel anlatım, sessizlik, içe dönüş. Slow cinema, atmosferik drama, şiirsel anlatım.",
        "positive_genres": [18, 14, 9648, 99, 36, 10749],
        "negative_genres": [28, 35, 80, 27, 53, 878, 10752],
        "positive_keywords": ["meditative", "slow", "atmospheric", "minimalist", "contemplative", "poetic", "quiet", "silence", "reflective",
                              "observation", "solitude", "landscape", "nature", "peaceful", "still", "calm", "inner",
                              "introspective", "zen", "spiritual", "patience", "rhythm", "breath", "space",
                              # Türkçe
                              "sessiz", "yalnızlık", "huzur", "doğa", "manzara", "dingin", "sakin",
                              "meditasyon", "ruhani", "iç dünya", "gözlem", "sabır", "nefes", "boşluk"],
        "negative_keywords": ["action", "comedy", "horror", "thriller", "explosive", "fast", "chase", "war",
                              "slapstick", "gunfight", "superhero", "blockbuster", "robot", "monster", "alien",
                              "aksiyon", "komedi", "korku", "patlama", "hızlı", "kovalamaca", "savaş", "süper kahraman"],
        "tone": {
            "atmosphere": "calm",
            "tempo": "slow",
            "film_type": "indie_and_festival",
            "dark_light": "balanced",
            "romance_thriller": 0.3,
            "nostalgia": 0.4,
        },
        "popularity_policy": "boutique_indie",
        "tmdb_params": {
            "without_genres": "28,35,80,27,53,878,10752",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.5,
            "min_vote_count": 30,
            "max_vote_count": 15000,
        },
    },
    "zihin": {
        "title": "Zihin Savaşı",
        "music_style": "Cinematic Tension & Puzzle",
        "description": "Beynin yanmaya hazır. Karmaşık planlar, beklenmedik dönüşler ve seni düşünmeye zorlayan hikayeler burada.",
        "intent": "Mind-bending, twist, puzzle, strateji, zeka oyunu. Psikolojik gerilim, bilim kurgu, gizem, karmaşık anlatı. Kullanıcıyı düşünmeye zorlamalı.",
        "positive_genres": [9648, 878, 53, 80, 28, 18],
        "negative_genres": [10749, 35, 10751, 16, 10402, 36],
        "positive_keywords": ["mind-bending", "twist", "puzzle", "psychological", "investigation", "mystery", "time loop", "memory", "dream", "consciousness",
                              "illusion", "deception", "paranoia", "unreliable narrator", "doppelganger", "identity",
                              "perception", "reality", "schizophrenia", "manipulation", "obsession", "labyrinth", "code",
                              # Türkçe
                              "gizem", "bulmaca", "psikolojik", "soruşturma", "hafıza", "rüya", "bilinç",
                              "yanılsama", "aldatma", "paranoya", "kimlik", "gerçeklik", "manipülasyon",
                              "saplantı", "labirent", "şifre", "zaman", "beyin"],
        "negative_keywords": ["romantic comedy", "musical", "family", "animation", "feel-good", "simple",
                              "fairy tale", "holiday", "christmas", "puppy", "cooking", "children", "dance",
                              "romantik komedi", "müzikal", "aile", "animasyon", "çocuk", "yemek", "dans"],
        "tone": {
            "atmosphere": "tense",
            "tempo": "medium_to_fast",
            "film_type": "mainstream_and_indie",
            "dark_light": "dark_to_balanced",
            "romance_thriller": 0.7,
            "nostalgia": 0.1,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "10749,35,10751,16,10402,36",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.5,
            "min_vote_count": 50,
        },
    },
    "kalp": {
        "title": "Kalbimin Sesi",
        "music_style": "Independent & Emotional",
        "description": "Büyük stüdyoların ötesinde, bağımsız sinemanın en samimi ve cesur hikayeleri. Festival ödüllü, iz bırakan yapımlar.",
        "intent": "Bağımsız sinema, art house, festival filmleri. Blockbuster dışı, karakter odaklı, yaratıcı anlatım. Küçük bütçe, büyük etki.",
        "positive_genres": [18, 35, 10402, 36, 99],
        "negative_genres": [28, 878, 27, 53, 80, 14, 10752, 10749],
        "positive_keywords": ["independent", "arthouse", "cannes", "sundance", "berlinale", "auteur", "coming of age", "loneliness", "small town", "slice of life", "indie", "festival", "character study",
                              "yönetmen sineması", "sanat filmi", "düşük bütçe", "festival ödülü",
                              "adolescence", "identity", "growing up", "outsider", "misfit", "quiet",
                              "everyday", "ordinary", "mundane", "authentic", "vulnerability", "diary",
                              # Türkçe
                              "bağımsız", "yalnızlık", "kasaba", "ergenlik", "kimlik",
                              "büyümek", "dışlanmış", "sessiz", "gündelik", "sıradan", "samimi", "günlük",
                              "taşra", "küçük şehir", "karakter", "iç dünya", "festival", "sanat"],
        "negative_keywords": ["blockbuster", "superhero", "explosion", "action", "sci-fi", "war", "epic", "mainstream",
                              "franchise", "sequel", "prequel", "universe", "multiverse", "avengers", "marvel", "dc",
                              "romance", "romantic comedy", "love story", "wedding", "proposal",
                              "süper kahraman", "patlama", "aksiyon", "savaş", "devam filmi",
                              "romantik komedi", "aşk hikayesi", "düğün"],
        "tone": {
            "atmosphere": "emotional",
            "tempo": "slow_to_medium",
            "film_type": "indie_only",
            "dark_light": "balanced",
            "romance_thriller": 0.3,
            "nostalgia": 0.4,
        },
        "popularity_policy": "strict_boutique",
        "tmdb_params": {
            "without_genres": "28,878,27,53,80,14,10752",
            "with_keywords": "10183|3475",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 30,
            "max_vote_count": 8000,
        },
    },
    "karmakar": {
        "title": "Karmaşakar",
        "music_style": "Surreal & Experimental",
        "description": "Gerçeklik sorgulanır, mantık bükülür. Normalin ötesinde, beklenmedik deneyimler için hazır ol.",
        "intent": "Gerçeküstü, deneysel, tuhaf, rüya gibi, mantık kıran. Fantastik, bilim kurgu, psikolojik ve sanat filmi arasında. Normal anlatı beklenmemeli.",
        "positive_genres": [14, 878, 53, 9648, 18, 27, 80],
        "negative_genres": [35, 10751, 16, 36, 99, 10402],
        "positive_keywords": ["surreal", "experimental", "dreamlike", "weird", "strange", "absurd", "psychedelic", "mind-bending", "abstract", "cult",
                              "hallucination", "metamorphosis", "parallel universe", "alternate reality", "distortion",
                              "subconscious", "fever dream", "kaleidoscope", "grotesque", "uncanny", "ritual",
                              # Türkçe
                              "gerçeküstü", "deneysel", "rüya", "tuhaf", "garip", "absürt", "halüsinasyon",
                              "paralel evren", "bilinçaltı", "grotesk", "ritüel", "sıradışı", "fantastik"],
        "negative_keywords": ["mainstream", "comedy", "family", "documentary", "historical", "musical", "predictable",
                              "formulaic", "sequel", "franchise", "superhero", "sports", "courtroom",
                              "komedi", "aile", "belgesel", "tarih", "müzikal", "devam filmi", "süper kahraman"],
        "tone": {
            "atmosphere": "surreal",
            "tempo": "slow_to_medium",
            "film_type": "indie_and_avant_garde",
            "dark_light": "dark_to_balanced",
            "romance_thriller": 0.4,
            "nostalgia": 0.2,
        },
        "popularity_policy": "boutique",
        "tmdb_params": {
            "without_genres": "35,10751,16,36,99,10402",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 30,
            "max_vote_count": 20000,
        },
    },
    "Retro": {
        "title": "Retro Bakış",
        "music_style": "80s Synthwave & Neon",
        "description": "Neon ışıklar, synthesizeler ve nostaljik teknoloji. 80lerin büyülü dünyasına adım at.",
        "intent": "1980'ler pop kültürü, neon, synthwave, VHS, arcade, eski teknoloji ve retro-futuristic atmosfer taşıyan filmler. 80'ler bilim kurgu/aksiyon/korku/suç/macera ikonik yapıtları.",
        "positive_genres": [878, 28, 53, 80, 12, 27, 35],
        "negative_genres": [18, 36, 99, 10751, 10749, 16, 10402, 10752, 37],
        "positive_keywords": ["1980s", "80s", "neon", "synth", "synthwave", "cyberpunk", "retro", "vhs", "arcade", "cassette", "analog", "cult classic", "dystopian", "robot", "android", "hacker", "computer", "virtual reality", "nightclub", "time travel", "neon noir", "retro-futuristic"],
        "negative_keywords": ["period drama", "historical", "medieval", "biography", "courtroom", "war drama", "classical hollywood", "silent film", "black and white", "old west", "romantic drama", "animation", "yeşilçam", "gramophone"],
        "tone": {
            "atmosphere": "stylish",
            "tempo": "medium_to_fast",
            "film_type": "cult_and_mainstream",
            "dark_light": "balanced_to_dark",
            "romance_thriller": 0.5,
            "nostalgia": 0.9,
        },
        "popularity_policy": "no_restriction",
        "tmdb_params": {
            "without_genres": "18,36,99,10751,10749,16,10402,10752,37",
            "sort_by": "vote_average.desc",
            "min_vote_average": 5.5,
            "min_vote_count": 30,
            "primary_release_date_lte": "1995-12-31",
            "primary_release_date_gte": "1977-01-01",
        },
    },
    "deep-chills": {
        "title": "Derin Ürperti",
        "music_style": "Slow-burn Atmospheric Tension",
        "description": "Karanlık çöktüğünde, perdeler kapandığında... Cesaretini topla, bu gece derin bir ürpertiye hazır ol.",
        "intent": "Slow-burn korku, psikolojik gerilim, atmosferik dehşet. Ani jumpscare değil; tedirginlik, bekleyiş, karanlık hissi. Folk horror, psikolojik korku.",
        "positive_genres": [27, 53, 9648, 14, 18, 878],
        "negative_genres": [35, 10749, 10402, 10751, 16, 28, 10752],
        "positive_keywords": ["psychological horror", "atmospheric", "slow burn", "folk horror", "haunted", "supernatural", "paranoia", "creepy", "tense", "disturbing",
                              "dread", "isolation", "possession", "occult", "ritual", "curse", "witch", "demon",
                              "ghost", "ominous", "foreboding", "unease", "eerie", "sinister", "forbidden",
                              # Türkçe
                              "korku", "psikolojik", "atmosferik", "lanetli", "doğaüstü", "paranoya", "ürpertici",
                              "tedirgin", "izolasyon", "ele geçirme", "büyü", "cadı", "iblis", "hayalet",
                              "uğursuz", "yasak", "karanlık", "dehşet", "lanet"],
        "negative_keywords": ["comedy", "romantic", "musical", "action", "family", "jump-scare", "mainstream horror", "slasher",
                              "comedy horror", "parody", "cartoon", "children", "dance", "wedding", "party",
                              "komedi", "romantik", "müzikal", "aksiyon", "aile", "çocuk", "dans", "düğün", "parti"],
        "tone": {
            "atmosphere": "horror",
            "tempo": "slow",
            "film_type": "indie_and_festival",
            "dark_light": "dark",
            "romance_thriller": 0.9,
            "nostalgia": 0.1,
        },
        "popularity_policy": "boutique_horror",
        "tmdb_params": {
            "without_genres": "35,10749,10402,10751,16,28,10752",
            "with_keywords": "210024|9727|255313|210021|12377|251417|193504",
            "sort_by": "vote_average.desc",
            "min_vote_average": 6.0,
            "min_vote_count": 30,
            "max_vote_count": 15000,
        },
    },
}

# TMDB genre name lookup
GENRE_NAMES = {
    28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
    80: "Suç", 99: "Belgesel", 18: "Drama", 10751: "Aile",
    14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
    9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
    10752: "Savaş", 53: "Gerilim", 37: "Western", 10770: "TV Film",
}

# Butik mood'lar (blockbuster dışlama uygulanacak)
BOUTIQUE_MOODS = {"kalp", "sessiz", "karmakar", "zamanyolcusu", "deep-chills"}

# Blockbuster eşiği
BLOCKBUSTER_VOTE_THRESHOLD = 20000

# Bilinen blockbuster TMDB ID'leri
BLOCKBUSTER_IDS = {
    244786, 157336, 27205, 155, 680, 122, 238, 13, 550, 497, 807, 372058,
    99861, 284052, 246655, 293660, 297761, 119450, 271110, 315635, 118340,
    140607, 181812, 335983, 330459, 297762, 299534, 299536, 426509, 436969,
    497698, 351286, 315162, 333339, 507086, 299537, 438631, 419704, 475557,
    337170, 246741, 507089, 604264, 760104, 568124, 361979, 581392, 496243,
    522402, 693134, 615656, 787699, 840326, 615677, 505642, 569094, 359940,
    453395, 853387, 893723, 616747, 502356, 640146, 906126, 559973, 619803,
    887767, 693134, 84773, 76341, 49026, 10681, 68718, 62211, 1891, 272,
    49013, 49521, 105, 11, 1892, 607, 348, 168259, 1894, 1895, 98, 24,
    49047, 747, 127585, 1893, 861, 696, 12100, 9737, 410, 601, 76492,
    533535, 157350, 76170, 64688, 127380, 810693, 816904, 736732,
    1072790, 1160018, 718930, 569094, 505642, 615656, 615677, 359940,
}


def is_blockbuster(tmdb_id: int = None, vote_count: int = None) -> bool:
    """Bir filmin blockbuster olup olmadığını kontrol eder."""
    if tmdb_id and tmdb_id in BLOCKBUSTER_IDS:
        return True
    if vote_count and vote_count >= BLOCKBUSTER_VOTE_THRESHOLD:
        return True
    return False


def get_profile(mood_id: str) -> dict:
    """Get a mood profile by ID, with fallback."""
    return MOOD_PROFILES.get(mood_id, {})


def get_positive_genres(mood_id: str) -> list:
    profile = MOOD_PROFILES.get(mood_id, {})
    return profile.get("positive_genres", [])


def get_negative_genres(mood_id: str) -> list:
    profile = MOOD_PROFILES.get(mood_id, {})
    return profile.get("negative_genres", [])


def get_tmdb_params(mood_id: str) -> dict:
    profile = MOOD_PROFILES.get(mood_id, {})
    return profile.get("tmdb_params", {})


def get_popularity_policy(mood_id: str) -> str:
    profile = MOOD_PROFILES.get(mood_id, {})
    return profile.get("popularity_policy", "no_restriction")


def is_boutique_mood(mood_id: str) -> bool:
    return mood_id in BOUTIQUE_MOODS


# --- Mood Seed Stratejileri (coklu TMDB discover varyasyonlari) ---
# Her mood icin birden fazla sorgu: farkli genre kombinasyonlari, keywordler, yil araliklari.
# seed_mood_repository bu stratejileri kullanarak film havuzunu genisletir.

MOOD_SEED_STRATEGIES = {
    "battaniye": [
        {"genres": [10751, 35, 10749]},
        {"genres": [16, 10751]},
        {"genres": [35, 18]},
        {"genres": [10749, 18]},
        {"genres": [10751, 18]},           # Aile dramı (live-action)
        {"genres": [35, 10749]},           # Rom-com
        {"genres": [18, 10402]},           # Müzikli dram
        {"genres": [10751, 35, 10749], "with_origin_country": "TR", "with_original_language": "tr"},
        {"genres": [35, 18], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "yolculuk": [
        {"genres": [12, 14]},
        {"genres": [12, 18]},
        {"genres": [878, 12]},
        {"genres": [10752, 18]},
        {"genres": [12, 37]},              # Macera + Western
        {"genres": [99, 12]},              # Belgesel macera
        {"genres": [12, 18], "with_keywords": "9672|187739"},
        {"genres": [12, 18], "with_origin_country": "TR", "with_original_language": "tr"},
        {"genres": [12, 14], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "gece": [
        {"genres": [53, 9648]},
        {"genres": [80, 53]},
        {"genres": [27, 9648]},
        {"genres": [80, 9648]},
        {"genres": [80, 18]},              # Suç draması
        {"genres": [53, 80, 9648], "with_keywords": "10250|179430|10024"},
        {"genres": [80, 53], "with_keywords": "14544|157733"},    # Cinayet gizemi + psikolojik gerilim
        {"genres": [80, 53], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "kahkaha": [
        {"genres": [35]},
        {"genres": [35, 10402]},
        {"genres": [35, 10751]},
        {"genres": [35, 80], "with_keywords": "189561"},
        {"genres": [35, 18]},              # Komedi-drama
        {"genres": [35, 10749]},           # Romantik komedi
        {"genres": [35], "with_keywords": "9736|207317"},    # Satir + komedi
        {"genres": [35], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "gozyasi": [
        {"genres": [18, 10749]},
        {"genres": [18, 10752]},
        {"genres": [18, 36]},
        {"genres": [18, 10749, 36]},
        {"genres": [18, 10751]},           # Aile draması
        {"genres": [18]},                  # Saf dram (geniş havuz)
        {"genres": [18, 10749], "with_origin_country": "TR", "with_original_language": "tr"},
        {"genres": [18], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "adrenalin": [
        {"genres": [28, 53]},
        {"genres": [28, 80]},
        {"genres": [878, 28]},
        {"genres": [28, 10752]},
        {"genres": [28, 12]},              # Aksiyon macera
        {"genres": [28]},                  # Saf aksiyon (geniş havuz)
        {"genres": [28, 53], "with_keywords": "152334|9882"},
        {"genres": [28, 80], "with_origin_country": "TR", "with_original_language": "tr"},
        {"genres": [28, 53], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "askbahcesi": [
        {"genres": [10749, 18]},
        {"genres": [10749, 35]},
        {"genres": [10402, 10749]},
        {"genres": [10749, 18, 35]},
        {"genres": [10749]},               # Saf romantik (geniş havuz)
        {"genres": [10749, 14]},           # Fantastik romantik
        {"genres": [10749, 18], "with_keywords": "3405"},    # Romance keyword
        {"genres": [10749, 18], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "zamanyolcusu": [
        {"genres": [36, 18], "primary_release_date_lte": "1990-12-31"},
        {"genres": [10752, 18], "primary_release_date_lte": "1990-12-31"},
        {"genres": [37], "primary_release_date_lte": "1990-12-31"},
        {"genres": [99, 36], "primary_release_date_lte": "1990-12-31"},
        {"genres": [18, 10749], "primary_release_date_lte": "1990-12-31"},
        {"genres": [80, 18], "primary_release_date_lte": "1990-12-31"},    # Eski suç dramaları
        {"genres": [35, 18], "primary_release_date_lte": "1990-12-31"},    # Eski komedi-dram
        {"genres": [35, 18], "primary_release_date_lte": "1990-12-31", "with_origin_country": "TR", "with_original_language": "tr"},
        {"genres": [18], "primary_release_date_lte": "1980-12-31", "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "sessiz": [
        {"genres": [18]},
        {"genres": [18, 9648]},
        {"genres": [14, 18]},
        {"genres": [99, 18]},
        {"genres": [18, 10749]},           # Sessiz romantik dram
        {"genres": [18], "with_keywords": "183967|9727|153850"},
        {"genres": [18], "with_keywords": "235648|161384"},    # Varoluşsal + coming of age
        {"genres": [18], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "zihin": [
        {"genres": [9648, 53]},
        {"genres": [878, 9648]},
        {"genres": [80, 9648]},
        {"genres": [9648, 53, 878]},
        {"genres": [878, 53]},             # Bilim kurgu gerilim
        {"genres": [9648, 53], "with_keywords": "191480|157733|10024"},
        {"genres": [9648, 80], "with_keywords": "158718|191480"},    # Zaman yolculuğu + mind-bending
        {"genres": [9648, 53], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
    "kalp": [
        {"genres": [18, 10749], "with_keywords": "10183|3475", "max_vote_count": 8000},
        {"genres": [18], "max_vote_count": 3000},
        {"genres": [18, 35], "max_vote_count": 5000},
        {"genres": [18, 10402], "max_vote_count": 5000},
        {"genres": [18], "with_keywords": "161384", "max_vote_count": 8000},    # Coming of age
        {"genres": [18, 10749], "max_vote_count": 5000},                        # Küçük romantik dram
        {"genres": [18], "with_origin_country": "TR", "with_original_language": "tr", "max_vote_count": 5000},
        {"genres": [18, 35], "with_origin_country": "TR", "with_original_language": "tr", "max_vote_count": 5000},
    ],
    "karmakar": [
        {"genres": [14, 53]},
        {"genres": [878, 53]},
        {"genres": [9648, 14]},
        {"genres": [27, 14]},
        {"genres": [878, 14]},             # Bilim kurgu fantastik
        {"genres": [14, 878, 9648], "with_keywords": "317|10535|9951"},
        {"genres": [14, 18], "with_keywords": "317|10535"},    # Deneysel dram
        {"genres": [14, 53], "with_origin_country": "TR", "with_original_language": "tr", "max_vote_count": 5000},
    ],
    "Retro": [
        {"genres": [878], "primary_release_date_gte": "1980-01-01", "primary_release_date_lte": "1989-12-31"},
        {"genres": [28, 53], "primary_release_date_gte": "1980-01-01", "primary_release_date_lte": "1989-12-31"},
        {"genres": [80, 53], "primary_release_date_gte": "1980-01-01", "primary_release_date_lte": "1989-12-31"},
        {"genres": [27, 53], "primary_release_date_gte": "1980-01-01", "primary_release_date_lte": "1989-12-31"},
        {"genres": [35, 878], "primary_release_date_gte": "1980-01-01", "primary_release_date_lte": "1989-12-31"},    # 80s komedi bilim kurgu
        {"genres": [878, 28, 53, 12, 80, 27], "primary_release_date_gte": "1977-01-01", "primary_release_date_lte": "1995-12-31"},
        {"genres": [878, 28, 53, 80], "primary_release_date_gte": "2000-01-01", "with_keywords": "3045|185428|208992|158385"},
        {"genres": [28, 12], "primary_release_date_gte": "1977-01-01", "primary_release_date_lte": "1995-12-31"},    # 80s aksiyon macera
    ],
    "deep-chills": [
        {"genres": [27, 53]},
        {"genres": [27, 9648]},
        {"genres": [27, 18]},
        {"genres": [27, 14]},
        {"genres": [53, 9648]},            # Gerilim + Gizem (korku olmadan)
        {"genres": [27, 53], "with_keywords": "210024|9727|255313|12377|251417|193504"},
        {"genres": [27, 18], "with_keywords": "978|210024"},    # Haunting + psikolojik korku
        {"genres": [27, 53], "with_origin_country": "TR", "with_original_language": "tr"},
    ],
}


def get_seed_strategies(mood_id: str) -> list:
    """Mood icin TMDB discover stratejilerini dondurur."""
    return MOOD_SEED_STRATEGIES.get(mood_id, [{"genres": get_positive_genres(mood_id)}])
