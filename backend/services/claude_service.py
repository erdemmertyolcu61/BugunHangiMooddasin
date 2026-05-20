"""
Claude AI Service - The 'Film Connoisseur' engine that assigns mood and emotional analysis.
"""
import json
import random
import asyncio
import logging
from anthropic import AsyncAnthropic
from backend.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_FAST_MODEL

logger = logging.getLogger("claude_service")

FALLBACK_TEMPLATES = [
    "Üstadın Notu: {title} sıradan bir {genre} filmi değil — {year} yılında çekilmiş olmasına rağmen her izleyişte taze kalan nadir yapımlardan. Bir akşamını buna ayır, pişman olmayacaksın.",
    "Üstadın Notu: {genre} türünde {title} kadar içtenlikle konuşan film az bulunur. {year} yapımı bu eser, jenerik akarken bile sende bir iz bırakacak cinsten.",
    "Üstadın Notu: {year} yılından gelen {title}, perdede görünen her şeyin altında sessiz bir fırtına taşıyor. {genre} sinemasını seven biri olarak söylüyorum: bu kaçırılmaz.",
    "Üstadın Notu: {title} bittiğinde koltuğunda bir süre kıpırdamadan oturacaksın. {year} yapımı bu {genre} filmi, sinemanın en dürüst hallerinden biri.",
    "Üstadın Notu: 25 yıldır {genre} filmleri izlerim; {title} o rafın en üst sırasında duranlardan. {year} yılının sessiz ama güçlü sesi.",
    "Üstadın Notu: {title} gibi filmler yılda bir gelir belki. {genre} kalıplarının dışına çıkmış, kendi kurallarını yazan bir {year} yapımı.",
    "Üstadın Notu: {genre} sevenler {title} adını duyunca gözleri parlar — ve haklıdırlar. {year} yılından bugüne uzanan bu hikayenin gücü hiç solmamış.",
    "Üstadın Notu: {title} izlerken zamanı unutacaksın. {year} yılının en cesur {genre} denemelerinden biri; yönetmen burada risk almış ve kazanmış.",
    "Üstadın Notu: Bazı filmler sadece izlenmez, yaşanır. {title} tam öyle bir {genre} deneyimi. {year}'dan gelen bu başyapıt ruhuna dokunacak.",
    "Üstadın Notu: {title} için tek bir kelime yeterli: otantik. {year} yapımı bu {genre} filmi, sahte duygulara yer bırakmıyor. Saf sinema bu.",
    "Üstadın Notu: {genre} türünde yüzlerce film gördüm ama {title} bambaşka bir yerde duruyor. {year} yılında çekilmiş olması onu daha da değerli kılıyor.",
    "Üstadın Notu: {title} sessiz bir devrim. Gösterişsiz ama derin; {year} yılının {genre} dünyasına bıraktığı en kalıcı iz olabilir.",
    "Üstadın Notu: Eğer {genre} türüne şüpheyle yaklaşıyorsan, {title} fikrini değiştirecek film olabilir. {year} yapımı bu eser, önyargıları kırar.",
    "Üstadın Notu: {title}, {genre} sinemasının ne kadar güçlü olabileceğinin kanıtı. {year} yılından bugüne taşıdığı duygusal yük hâlâ taptaze.",
    "Üstadın Notu: Koltukta geriye yaslan ve {title} akışına bırak kendini. Bu {year} yapımı {genre} filmi, sinema neden var sorusunun en güzel cevaplarından.",
]


class ClaudeService:
    def __init__(self):
        self.client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        self.model = CLAUDE_MODEL

    def _generate_fallback(self, title: str, genres: list = None, year: str = None, vote_average: float = None) -> str:
        template = random.choice(FALLBACK_TEMPLATES)
        genre = genres[0] if genres else "sinema"
        y = year if year and year != "None" else "günümüzün"
        return template.format(title=title, genre=genre, year=y, rating=vote_average or "")

    async def analyze_movie(self, title: str, overview: str, ratings: dict,
                            genres: list = None, year: str = None, vote_average: float = None) -> dict:
        """Send movie data to Claude and get mood + connoisseur analysis."""

        ratings_lines = []
        if ratings.get("imdb_rating"):
            ratings_lines.append(f"IMDb: {ratings['imdb_rating']}/10")
        if ratings.get("rotten_tomatoes"):
            ratings_lines.append(f"Rotten Tomatoes: {ratings['rotten_tomatoes']}")
        if ratings.get("metacritic"):
            ratings_lines.append(f"Metacritic: {ratings['metacritic']}/100")
        ratings_text = "\n".join(ratings_lines) if ratings_lines else "Puan bilgisi yok."

        genre_text = ", ".join(genres) if genres else "Belirtilmemiş"
        year_text = year or "Bilinmiyor"
        director_text = ratings.get("director") or "Bilinmiyor"

        prompt = (
            "Sen 25 yılını sinemaya adamış, Cannes, Sundance ve Berlin gibi dünya festivallerini avucunun içi gibi bilen, "
            "sofistike, entelektüel ve derin bir sinema eleştirmenisin (Üstat). "
            "Üslubun bilge, samimi, hafif melankolik ve her zaman merak uyandırıcı olmalı.\n\n"
            f"Film: {title}\n"
            f"Yönetmen: {director_text}\n"
            f"Konu: {overview}\n"
            f"Türler: {genre_text}\n"
            f"Yapım Yılı: {year_text}\n"
            f"Puanlar:\n{ratings_text}\n\n"
            "Görevin:\n"
            "1. Mood: Aşağıdaki 14 moddan TAM BİR TANESİNİ seç (emojiyi de ekle):\n"
            "(Battaniye Modu 🛋️, Yolculuk Ruhu 🧳, Gece Kuşu 🌙, Kahkaha Molası 😂, "
            "Gözyaşı Gecesi 🍷, Adrenalin Patlaması 🔥, Aşk Bahçesi 💐, Zaman Yolcusu 📽️, "
            "Sessiz Yolculuk 🤫, Zihin Savaşı 🧠, Kalbimin Sesi 💓, Karmaşakar 🔮, "
            "Retro Bakış 📼, Derin Ürperti 🕯️).\n\n"
            "MOD TANIMLARI VE KRİTİK AYRIŞTIRMA KURALLARI:\n\n"
            "1. Battaniye Modu 🛋️: Cozy, sıcak, rahat, feel-good. Aile, yumuşak komedi, tatlı romantik, sıcak dram. "
            "Kullanıcıyı yormayan, korkutmayan filmler. Örn: The Intouchables, Amelie, Paddington.\n\n"
            "2. Yolculuk Ruhu 🧳: Keşif, macera, yol hikayesi, road movie, fantastik yolculuk, doğa, ufuk hissi. "
            "Fiziksel veya içsel yolculuk. Örn: Into the Wild, The Motorcycle Diaries, Lord of the Rings.\n\n"
            "3. Gece Kuşu 🌙: Gece, karanlık şehir, suç, gizem, thriller, noir hissi. Neon, karanlık sokak. "
            "Derin Ürperti'den farklı: Gece noir/gizem/suç ağırlıklı. Örn: Se7en, Drive, Taxi Driver.\n\n"
            "4. Kahkaha Molası 😂: SADECE live-action komedi. Animasyon (çizgi film) asla bu modda olmaz. "
            "Absürt komedi, buddy comedy, kara mizah. Zihni boşaltan rahatlama hissi. Örn: The Hangover, Superbad, Monty Python.\n\n"
            "5. Gözyaşı Gecesi 🍷: Duygusal yoğunluk, kayıp, özlem, aile dramı, savaş dramı. Ağlatan ama anlamlı. "
            "Katarsis hissi. Örn: The Green Mile, Schindler's List, A Star is Born.\n\n"
            "6. Adrenalin Patlaması 🔥: Aksiyon, hız, tehlike, yüksek gerilim, kovalamaca. "
            "Kullanıcıyı koltuğun kenarında tutan filmler. Örn: Mad Max: Fury Road, Die Hard, John Wick.\n\n"
            "7. Aşk Bahçesi 💐: Romantik, sıcak, duygusal, zarif. Aşk ana unsur. Rom-com olabilir ama duygu yoğun olmalı. "
            "Kalbimin Sesi'nden farklı: Aşk Bahçesi romantik ana odak; Kalp daha indie/minimal. Örn: Before Sunrise, La La Land.\n\n"
            "8. Zaman Yolcusu 📽️: Tarih, dönem filmi, biyografi, eski atmosfer. Vintage hissi. "
            "Retro Bakış'tan farklı: Zaman Yolcusu tarihi dönem/geçmiş; Retro 80ler/neon/pop kültür estetiği. Örn: The King's Speech, 12 Years a Slave.\n\n"
            "9. Sessiz Yolculuk 🤫: Minimal, sakin, meditatif, yavaş tempo. Slow cinema, görsel anlatım ön planda. "
            "Aksiyon/yüksek tempo asla olmaz. Huzurlu/derin. Örn: Nomadland, Stalker, Perfect Days.\n\n"
            "10. Zihin Savaşı 🧠: Mind-bending, twist, puzzle, zeka oyunu. Psikolojik gerilim, karmaşık anlatı. "
            "Gece Kuşu'ndan farklı: Zihin puzzle/twist odaklı; Gece noir atmosfer/suç. Örn: Inception, Memento, The Prestige.\n\n"
            "11. Kalbimin Sesi 💓: SADECE bağımsız sinema, art house, festival filmleri (A24, Neon, Searchlight, Mubi). "
            "Blockbuster dışı, karakter odaklı, yaratıcı anlatım. Küçük bütçe, büyük etki. Romantik filmler (Aşk Bahçesi) bu moda GİRMEZ. "
            "Blockbuster, süper kahraman, yüksek bütçeli filmler ASLA bu modda olmaz. "
            "Örn: Aftersun, Past Lives, Moonlight, The Florida Project, Paterson, First Cow.\n\n"
            "12. Karmaşakar 🔮: Gerçeküstü, deneysel, rüya gibi, mantık kıran. Normal anlatı beklenmez. "
            "Zihin Savaşı'ndan farklı: Karmaşakar daha surreal/experimental; Zihin puzzle/zeka oyunu. Örn: Eternal Sunshine, Synecdoche New York.\n\n"
            "13. Retro Bakış 📼: 80ler/90lar estetiği, neon, synth, VHS, arcade. Hem eski hem yeni retro filmler. "
            "Zaman Yolcusu'ndan farklı: Retro 80s/neon/pop kültür; Zaman Yolcusu tarih/vintage/dönem. Örn: Blade Runner 2049, Drive, The Guest.\n\n"
            "14. Derin Ürperti 🕯️: Slow-burn korku, psikolojik gerilim, atmosferik dehşet. Ani jumpscare değil; "
            "tedirginlik, bekleyiş, karanlık hissi. Gece Kuşu'ndan farklı: Deep-Chills psikolojik korku/ürperti; Gece noir/suç/gizem. "
            "Örn: The Witch, Hereditary, The Lighthouse, Midsommar.\n\n"
            "GENEL AYRIŞTIRMA İLKELERİ:\n"
            "- Sadece genre'a bakma; filmi izleyenin hissedeceği atmosferi düşün.\n"
            "- Karanlık suç/gizem ise Gece Kuşu; psikolojik korku/slow-burn ise Derin Ürperti.\n"
            "- Romantik atmosfer ana unsursa Aşk Bahçesi; bağımsız/art house/festival filmi ise Kalbimin Sesi (romantik bile olsa).\n"
            "- Aksiyon/tempo yüksekse Adrenalin; sadece gizem/puzzle ise Zihin Savaşı.\n"
            "- Tarih/dönem/kostüm varsa Zaman Yolcusu; neon/synth/80s estetiği varsa Retro Bakış.\n"
            "- Çizgi film/animasyon asla Kahkaha Molası olmaz; Battaniye Modu'na gider.\n"
            "- Blockbuster, süper kahraman, çok yüksek bütçeli filmler Kalbimin Sesi olamaz.\n\n"
             "2. Üstadın Notu: 'Üstadın Notu:' ile başlayan, Türkçe 4-5 cümlelik entelektüel derinliği olan bir yorum yaz.\n\n"
            "HIDDEN GEM 3-KATMANLI YAPI (her not bu üç katmanı doğal akışla içermeli):\n"
            "KATMAN 1 — MOOD ŞIFASI: Bu film neden tam da bu ruh haline biçilmiş kaftan? Mood'un duygusal ihtiyacını filmin atmosferi, ritmi ve tonu nasıl karşılıyor?\n"
            "KATMAN 2 — MAINSTREAM'İN KAÇIRDIĞI: Bu film neden herkesin radarında değil? Hangi ülkenin/geleneğin/yönetmenin eseri ve ana akım neden bunu görmezden geldi? Festivallerden neden sessizce geçti, hangi kültürel bariyeri aşamadı? (İspanyol, Kore, İskandinav, Rumen, İran, Türk, Latin Amerika, bağımsız Amerikan sineması gibi coğrafya/gelenek vurgusu)\n"
            "KATMAN 3 — PLOT-DRIVEN SİNEMASAL SEBEP: Filmin anlatısındaki tematik çatışmayı, karakterin iç yolculuğunu veya yönetmenin biçimsel dilini somut bir gözlemle çöz. Hikayeyi özetleme — 'bu hikaye aslında X hakkında' entelektüel okuma.\n\n"
            "KRİTİK KURALLAR:\n"
            "- Sen 65.000'den fazla film izlemiş, sinema kuramına hâkim bir entelektüelsin. Bazin, Sontag, Bordwell okumuş; auteur kuramını, mizansen analizini, sinema akımlarını (Fransız Yeni Dalgası, İtalyan Yeni Gerçekçiliği, Alman Dışavurumculuğu, Kore Yeni Dalgası, Rumen Yeni Dalgası, İran Sineması vb.) içselleştirmiş biri gibi konuş.\n"
            "- Film özetini ASLA tekrarlama. Konuyu anlatma. Hikayeyi özetleme.\n"
            "- Bunun yerine: filmin biçimsel dilini (kadraj, ışık, kurgu ritmi, ses tasarımı, renk paleti) ve TEMATİK/FELSEFİ katmanını çöz.\n"
            "- MUTLAKA filmin anlatısındaki SOMUT bir unsura değin — bir karakter dinamiği, bir mekânın dramatik işlevi, bir sahnenin yarattığı ruh hali, bir diyaloğun altında yatan gerilim.\n"
            "- Filmi bir bağlama otur: yönetmenin auteur imzası, ait olduğu sinema akımı/geleneği, ÜLKE SİNEMASI gelenegi.\n"
            "- En az bir entelektüel kıyas veya gönderme yap — ama snobluk değil, içten bir bilgelikle.\n"
            "- HER FİLM İÇİN FARKLI VE ÖZGÜN bir not yaz. Klişe kalıplar, 'güzel film', 'kaçırılmaz', 'başyapıt' gibi içi boş övgüler YASAK.\n"
            "- Öznel ve bilge ol: 'Cannes'da ilk izlediğimde...', 'Bu, Antonioni'nin yabancılaşma temasının çağdaş bir yankısı' gibi — ama anlaşılır kal.\n"
            "- Keskin ve yoğun: Her cümle bir fikir taşısın. Dolgu cümle YASAK. Spoiler YASAK.\n"
            "- ULUSLARARASI SİNEMA VURGUSU: Filmin hangi ülke/kültür geleneğinden geldiğini belirt. İspanyol, Kore, İskandinav, Rumen, İran, Türk, Latin Amerika, Japon, Fransız, İtalyan sineması gibi coğrafi bağlamı öne çıkar.\n\n"
            "Örnek Hidden Gem notları (3 katmanlı yapı):\n"
            "- 'Üstadın Notu: Yorgun bir akşamda battaniyenin altına çekilip dünyadan kopma ihtiyacın varsa, Koreeda'nın bu Japon şaheseri tam sana göre — aile kavramını yeniden tanımlayan sıcaklığıyla içini ısıtacak. Cannes'da Altın Palmiye aldığı halde geniş kitlelere ulaşamadı çünkü Hollywood dağıtım ağı Japon sinema dilinin o yavaş, meditatif ritmini \"pazarlanamaz\" buldu. Oysa Koreeda burada aile bağını kan değil sevgi üzerinden kurarken, neoliberal toplumun görünmez bıraktığı insanların direniş biçimini sessizce fotoğraflıyor.'\n"
            "- 'Üstadın Notu: Gece kuşu modundayken şehrin karanlık damarlarına inmek istiyorsan, bu İskandinav noir'ı seni doğru yere götürür — Kopenhag'ın dondurucu sokaklarında bir suç labirenti. Danimarka gerilim geleneğinin en keskin örneklerinden biri olmasına rağmen Hollywood remakelerinin gölgesinde kaldı; İskandinav dilinin \"egzotikliği\" ana akımın ilgisini kırdı. Yönetmen burada suçu bir bulmaca değil, yalnızlığın kronik bir semptomu olarak okuyor — dedektifin soruşturması aslında kendi kırılganlığıyla yüzleşmesi.'\n"
            "- 'Üstadın Notu: Zihnin bükülmeye hazırsa bu Arjantinli yapım tam senin için — zaman algısını kıran anlatısıyla düşünmeden uyuyamayacaksın. Latin Amerika sinemasının en iddialı bilmecelerinden biri olmasına rağmen İspanyolca dil bariyeri ve sınırlı festival dağıtımı yüzünden Nolan hayranlarının radarına hiç girmedi. Oysa yönetmen burada hafıza ve kimlik arasındaki uçurumu Borges'in labirentlerine yakışır bir biçimsel cesaretle inşa ediyor.'\n\n"
            "KRİTİK — Tüm çıktı KESİNLİKLE TÜRKÇE olmalıdır. Mood adı ve emoji dışında İngilizce kelime kullanma.\n\n"
            "SADECE geçerli JSON döndür:\n"
            '{"mood": "Türkçe Mod Adı (emoji ile)", "analysis": "Üstadın Notu: Türkçe yorumunuz"}'
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                message = await self.client.messages.create(
                    model=self.model,
                    max_tokens=450,
                    messages=[{"role": "user", "content": prompt}],
                )

                response_text = message.content[0].text.strip()

                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()

                result = json.loads(response_text)
                analysis = result.get("analysis")
                if not analysis:
                    analysis = self._generate_fallback(title, genres, year, vote_average)
                return {
                    "mood": result.get("mood", "Bilinmiyor"),
                    "analysis": analysis,
                }
            except Exception as e:
                print(f"Claude attempt {attempt+1} failed for '{title}': {e}")
                if attempt == max_retries - 1:
                    return {
                        "mood": "Bilinmiyor",
                        "analysis": self._generate_fallback(title, genres, year, vote_average),
                    }
                import asyncio
                await asyncio.sleep(1)


claude_service = ClaudeService()


# --- "Kafan mı Karışık?" için yardımcı metod (mood_profiles.py ile senkron) ---
MOOD_TO_GENRES = {
    "battaniye": [10751, 35, 18, 10749, 16],
    "yolculuk": [12, 14, 878, 28, 10752, 18],
    "gece": [53, 9648, 80, 27, 28],
    "kahkaha": [35, 10402, 10751, 80],
    "gozyasi": [18, 10749, 10752, 36],
    "adrenalin": [28, 53, 878, 80, 12],
    "askbahcesi": [10749, 18, 35, 10402],
    "zamanyolcusu": [36, 99, 18, 10752, 37],
    "sessiz": [18, 14, 9648, 99, 36],
    "zihin": [9648, 878, 53, 80, 28],
    "kalp": [18, 35, 99, 10402, 36],
    "karmakar": [14, 878, 53, 9648, 18],
    "Retro": [878, 53, 28, 80, 12],
    "deep-chills": [27, 53, 9648, 14, 18],
    "belirsiz": [18, 878, 35, 53],
}

class ConfusionService:
    def __init__(self):
        self.client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        self.model = CLAUDE_MODEL
        self.fast_model = CLAUDE_FAST_MODEL

    async def extract_user_intent(self, user_text: str) -> dict:
        """Kullanıcının serbest metninden zengin niyet/intent çıkarır (Phase 1)."""

        if not user_text or len(user_text.strip()) < 3:
            return {}

        prompt = f"""Sen 25 yılını sinema salonlarının kadife koltuklarında geçirmiş, Cannes'dan Sundance'e toz yutmuş eski toprak bir sinema gurmesisin ("Üstad"). Kullanıcıya hitabın her zaman samimi, hafif entelektüel ama asla mesafeli olmayan bir "Evlat" tonundadır. Dilin %100 Türkçe. Kullanıcının yazdığını — ne kadar dağınık, duygusal veya hatalı olursa olsun — arkadaki anlamsal zekânla derinlemesine çözümle; o cümlenin getirdiği saklı atmosferi ve ruh halini sanatsal olarak oku.
Kullanıcı: "{user_text}"

14 MOOD (id: kısa tanım):
battaniye: sıcak/rahat/feel-good, yormaz | yolculuk: keşif/yol/macera | gece: karanlık şehir/suç/noir/gizem | kahkaha: komedi/gülme/hafif | gozyasi: duygusal/ağlatan/kayıp/aile dramı | adrenalin: aksiyon/tempo/heyecan | askbahcesi: romantik/aşk/tutku | zamanyolcusu: tarih/dönem/klasik/nostalji | sessiz: sakin/minimal/içe dönük/yavaş | zihin: puzzle/twist/mind-game | kalp: bağımsız/art house/festival/karakter odaklı | karmakar: gerçeküstü/deneysel/tuhaf | Retro: 80s/neon/synthwave/VHS | deep-chills: slow-burn atmosferik korku/gerilim

NÜANS KURALLARI (mood seçiminde belirleyici):
- "yorgun/bitkin/uykusuz" → düşük enerji: battaniye/sessiz/kalp (adrenalin/kahkaha DEĞİL)
- "kafamı dağıtmak/gülmek/stres atayım" → kahkaha/battaniye
- "romantik" → askbahcesi; "romantik ama klişe olmasın" → kalp/gozyasi (askbahcesi DEĞİL); "aşk ama ağlatan" → gozyasi
- KRİTİK: "sevgilimle/eşimle/partnerimle" + "şehvetli/tutkulu/ateşli/erotik/romantik gece/çift gecesi/date night" → primary_mood KESİNLİKLE "askbahcesi" (yoğun romantik/tutkulu), prefer'a "passionate" ekle. ASLA battaniye/"sıcak rahat ortam" değil.
- "karanlık+kaliteli" → gece/zihin/deep-chills; "gerilmek/korkmak" → deep-chills/gece
- "düşündüren/felsefi/twist" → zihin/kalp/karmakar
- "nostaljik/klasik/tarih" → zamanyolcusu; "80ler/neon/synth" → Retro
- "sıradışı/tuhaf" → karmakar; "bağımsız/indie/festival" → kalp; "macera/keşif" → yolculuk
- MEVSİM/HAVA (atmosphere'a yaz): "kış/kar/soğuk" → battaniye/sessiz/gozyasi/zamanyolcusu (içe dönük cozy, ASLA tersi); "yaz/güneş" → yolculuk/askbahcesi/adrenalin; "sonbahar" → sessiz/gozyasi/kalp; "yağmur" → sessiz/gozyasi/battaniye
- Kısa/belirsiz → en güçlü ipucundan primary seç, mood_mix geniş tut. Çelişkili istek → baskın duygu primary, diğeri secondary.
- ASLA kullanıcının istediğinin tersini önerme (kış istendi → sıcak/yazlık DEĞİL).

YAZIM HATASI / KUSURSUZ HATA YAKALAMA: Film/oyuncu/yönetmen adı yanlış, eksik veya Türkçe okunduğu gibi yazılsa bile (Şovşenk Redempşın→The Shawshank Redemption, Intersellar→Interstellar, Tarantno→Quentin Tarantino, Nuri Bilge→Nuri Bilge Ceylan) anlamsal zekânla doğrusunu bul. Kullanıcıyı ASLA azarlama; "Bunu mu demek istedin galiba evlat?" esnekliğiyle nazikçe düzelt. Varsa correction_detected=true + corrected_text="Evlat, '[yanlış]' derken [doğru]'ı kastettin galiba..." (sıcak, azarlamayan ton), yoksa false + null.

VARLIK ÇIKARIMI: metindeki film/kişi adlarını ekleri temizleyerek çıkar. intent_hint:
- "similar": benzer film istiyor ("gibi/tarzında/tadında/benzeri")
- "lookup": filmi bulmak/bilgi istiyor
- "mood_inspired": referansı sadece atmosfer için kullanıyor
- "none": film/kişi yok

context_dimensions: atmosphere (mevsim/hava/ortam veya null), companion ("sevgilimle/ailemle/yalnız" veya null), implicit_mood (1 cümle sinemasal ihtiyaç).
ustad_line: kısa, şiirsel, Türkçe, ustanın sesi, spoiler yok.

Eğer film veya kişi tespit edemezsen, listeler boş olsun ve intent_hint "none" olsun.

SADECE geçerli JSON döndür (başka hiçbir şey yazma):
{{
  "user_intent_summary": "Kullanıcının ne istediğini kısaca özetleyen Türkçe cümle",
  "primary_mood": "mood_id",
  "secondary_moods": [
    {{"mood_id": "mood_id", "weight": 0.30}},
    {{"mood_id": "mood_id", "weight": 0.20}}
  ],
  "energy_level": "low|medium|high",
  "emotional_weight": "light|medium|heavy",
  "pace": "slow|medium|fast",
  "darkness_level": "light|neutral|dark|very_dark",
  "complexity": "easy|medium|complex",
  "avoid": ["empty_comedy", "heavy_tragedy"],
  "prefer": ["character_drama", "warm_story"],
  "ustad_line": "Üstad'ın sinemasal Türkçe satırı",
  "mood_mix": [
    {{"mood_id": "kalp", "title": "Kalbimin Sesi", "percentage": 50}},
    {{"mood_id": "sessiz", "title": "Sessiz Yolculuk", "percentage": 30}},
    {{"mood_id": "battaniye", "title": "Battaniye Modu", "percentage": 20}}
  ],
  "correction_detected": false,
  "corrected_text": null,
  "context_dimensions": {{
    "atmosphere": "yaz gecesi veya null",
    "companion": "sevgilimle veya null",
    "implicit_mood": "Bu bağlamdan doğan sinemasal ihtiyacın 1 cümlelik Türkçe özeti"
  }},
  "detected_entities": {{
    "film_titles": ["Film Adı (ek olmadan)"],
    "person_names": [{{"name": "Kişi Adı", "type": "actor|director|unknown"}}],
    "intent_hint": "similar|lookup|mood_inspired|none"
  }}
}}"""

        # Model merdiveni: önce hızlı Haiku; başarısız/geçersiz olursa
        # ÇALIŞAN Sonnet'e düş (asla doğrudan aptal rule-based'e değil).
        # analyze_movie'deki kanıtlanmış retry desenini yansıtır.
        models = [self.fast_model, self.model, self.model]
        for attempt, model in enumerate(models):
            try:
                message = await self.client.messages.create(
                    model=model, max_tokens=900,
                    messages=[{"role": "user", "content": prompt}],
                )

                response_text = message.content[0].text.strip()
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()

                result = json.loads(response_text)
                if result.get("primary_mood") and result.get("mood_mix"):
                    if attempt > 0:
                        logger.info("[ConfusionService] extract_user_intent recovered on attempt %s (model=%s)", attempt + 1, model)
                    return result
                logger.warning("[ConfusionService] extract_user_intent attempt %s model=%s: invalid JSON shape", attempt + 1, model)
            except Exception as e:
                logger.warning("[ConfusionService] extract_user_intent attempt %s model=%s failed: %s", attempt + 1, model, e)
            if attempt < len(models) - 1:
                await asyncio.sleep(1)

        logger.error("[ConfusionService] extract_user_intent exhausted all models — falling back to rule-based")
        return {}

    async def rerank_movies(self, user_text: str, intent: dict, candidates: list) -> dict:
        """Aday filmleri kullanıcı niyetine göre yeniden sıralar (Phase 2)."""

        if not candidates:
            return {}

        ustad_line = intent.get("ustad_line", "")
        intent_summary = intent.get("user_intent_summary", user_text[:100])
        energy = intent.get("energy_level", "medium")
        pace = intent.get("pace", "medium")
        darkness = intent.get("darkness_level", "neutral")
        emotional_weight = intent.get("emotional_weight", "medium")
        avoid = intent.get("avoid", [])
        prefer = intent.get("prefer", [])
        context_dims = intent.get("context_dimensions", {})
        atmosphere = context_dims.get("atmosphere") or ""
        companion = context_dims.get("companion") or ""
        implicit_mood = context_dims.get("implicit_mood") or ""

        # Film listesini prompt için hazırla (max 25)
        candidates_for_prompt = candidates[:25]
        films_text = ""
        for i, m in enumerate(candidates_for_prompt, 1):
            title = m.get("title", "?")
            year = m.get("release_date", "")[:4] if m.get("release_date") else "?"
            genres = m.get("genre_ids", [])
            overview = (m.get("overview") or "")[:120]
            vote = m.get("vote_average", "?")
            tmdb_id = m.get("id", m.get("tmdb_id", i))
            mood_scores_raw = m.get("mood_scores", {})
            top_moods = sorted(mood_scores_raw.items(), key=lambda x: -x[1])[:3] if mood_scores_raw else []
            top_moods_str = ", ".join(f"{k}:{v:.0f}" for k, v in top_moods) if top_moods else "-"
            films_text += (
                f"{i}. ID:{tmdb_id} | {title} ({year}) | Puan:{vote} | "
                f"Üst Moodlar:{top_moods_str} | Özet:{overview}\n"
            )

        # Context satırı — varsa ekle, yoksa boş bırak
        context_line = ""
        if atmosphere or companion or implicit_mood:
            parts = []
            if atmosphere: parts.append(f"Atmosfer/Mevsim: {atmosphere}")
            if companion: parts.append(f"Eşlik bağlamı: {companion}")
            if implicit_mood: parts.append(f"Örtük ihtiyaç: {implicit_mood}")
            context_line = "\n" + " | ".join(parts)

        prompt = f"""Sen 25 yılını sinema salonlarının kadife koltuklarında geçirmiş, Cannes'dan Sundance'e toz yutmuş eski toprak bir sinema gurmesisin ("Üstad").
Üslubun: %100 Türkçe, entelektüel ama sıcak, "Evlat" der gibi; samimi ama asla mesafeli değil. Jargon yok, içtenlik var.
Tüm edebi gücünü uzun açıklamalara değil, her filmin 1-2 cümlelik "gurme not"una sakla — kısa, yoğun, kullanıcının bağlamına özel.

Kullanıcı şunu yazdı: "{user_text}"
Niyet özeti: {intent_summary}{context_line}
Enerji: {energy} | Tempo: {pace} | Karanlık: {darkness} | Duygusal ağırlık: {emotional_weight}
Kaçınılacaklar: {avoid}
Tercihler: {prefer}

Aşağıdaki {len(candidates_for_prompt)} film adayından EN FAZLA 8 tanesini seç ve kullanıcının ruh haline göre sırala.
Her film için kısa Türkçe bir "gurme_not" yaz (spoiler yok, 1-2 cümle, kullanıcının BAĞLAMINA hitap et).

Filmler:
{films_text}

SIRALAMA KRİTERLERİ (öncelik sırasıyla):
1. Kullanıcının yazdığı metinle DOĞRUDAN tematik örtüşme (anahtar kelimeler, his, atmosfer)
2. Eğer kullanıcı bir film/yönetmen adını referans verdiyse: sadece tür değil; aynı sinematik aura, görsel dil ve anlatı yapısına sahip filmleri öne al (estetik kardeşlik)
3. Eğer eşlik bağlamı varsa (sevgilimle/ailemle/yalnız): o bağlama uygunluk kritik
4. Eğer mevsim/atmosfer varsa: film paleti ve tonu buna uygun olmalı
5. Filmin genel tonu ve temposu kullanıcının enerji seviyesiyle uyumlu mu?
6. Çeşitlilik: Aynı türden art arda 3+ film seçme.

GURME NOT KURALLARI:
- Kullanıcının bağlamına DOĞRUDAN bağla. Örnekler:
  * "sevgilimle yaz akşamı" → "O sıcak yaz gecesinde sevgilinle izlerken, bu filmin o İtalyan güneşi tam içinizi ısıtacak."
  * "yalnız kış gecesi" → "Karlı bir gecede tek başına sarılacağın o hüzünlü ses bu filmde saklı."
  * "arkadaşlarla stres atmak" → "Arkadaşlarınla kahkaha patlatmak için koltukların kenarına oturun."
  * "yorgun hafif bir şey" → "Yorgun bir akşamda seni yormadan saracak, sıcaklığını hissettiren türden."
- Generic "Harika bir film" veya "Kaçırma!" YASAK.
- Her not kendine özgün olmalı — aynı kalıbı tekrarlama.
- Spoiler ASLA.

SADECE geçerli JSON döndür:
{{
  "ustad_line": "Bu özel bağlama yazılmış kısa sinemasal Türkçe cümle (Üstad sesi)",
  "recommendations": [
    {{
      "tmdb_id": <film ID numarası>,
      "rank": 1,
      "fit_score": <0-100 arası uyum puanı>,
      "reason_turkish": "Kullanıcının bağlamına/hissine özel Türkçe gurme not (spoiler yok)",
      "mood_match": ["mood_id1", "mood_id2"]
    }}
  ]
}}"""

        try:
            message = await self.client.messages.create(
                model=self.model, max_tokens=1200,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            result = json.loads(response_text)
            if result.get("recommendations") and len(result["recommendations"]) > 0:
                # ustad_line yoksa intent'tekini kullan
                if not result.get("ustad_line") and ustad_line:
                    result["ustad_line"] = ustad_line
                return result
        except Exception as e:
            logger.warning("[ConfusionService] rerank_movies failed: %s", e)

        return {}

    async def get_mood_based_recommendation(self, user_text: str = None) -> dict:
        """Kullanıcının serbest metninden mood karışımı çıkarır. (Geriye uyumluluk için)"""
        if not user_text or len(user_text.strip()) < 3:
            return {"message": "", "mood_mix": []}

        intent = await self.extract_user_intent(user_text)
        if intent and intent.get("mood_mix"):
            return {
                "message": intent.get("user_intent_summary", ""),
                "mood_mix": intent.get("mood_mix", []),
            }
        return {"message": "", "mood_mix": []}

    def _get_genre_name(self, genre_id: int) -> str:
        genre_map = {
            28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
            80: "Suç", 99: "Belgesel", 18: "Drama", 10751: "Aile",
            14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
            9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
            10752: "Savaş", 53: "Gerilim", 10770: "TV Film"
        }
        return genre_map.get(genre_id, "Film")


confusion_service = ConfusionService()
