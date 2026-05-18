"""
Claude AI Service - The 'Film Connoisseur' engine that assigns mood and emotional analysis.
"""
import json
import random
from anthropic import AsyncAnthropic
from backend.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_FAST_MODEL

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

        prompt = (
            "Sen 25 yılını sinemaya adamış, Cannes, Sundance ve Berlin gibi dünya festivallerini avucunun içi gibi bilen, "
            "sofistike, entelektüel ve derin bir sinema eleştirmenisin (Üstat). "
            "Üslubun bilge, samimi, hafif melankolik ve her zaman merak uyandırıcı olmalı.\n\n"
            f"Film: {title}\n"
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
             "2. Üstadın Notu: 'Üstadın Notu:' ile başlayan, Türkçe 3-4 cümlelik entelektüel derinliği olan bir yorum yaz.\n"
            "KRİTİK KURALLAR:\n"
            "- Sen 65.000'den fazla film izlemiş, sinema kuramına hâkim bir entelektüelsin. Bazin, Sontag, Bordwell okumuş; auteur kuramını, mizansen analizini, sinema akımlarını (Fransız Yeni Dalgası, İtalyan Yeni Gerçekçiliği, Alman Dışavurumculuğu, Kore Yeni Dalgası vb.) içselleştirmiş biri gibi konuş.\n"
            "- Film özetini ASLA tekrarlama. Konuyu anlatma. Hikayeyi özetleme.\n"
            "- Bunun yerine: filmin biçimsel dilini (kadraj, ışık, kurgu ritmi, ses tasarımı, renk paleti) ve TEMATİK/FELSEFİ katmanını çöz.\n"
            "- Filmi bir bağlama otur: yönetmenin auteur imzası, ait olduğu sinema akımı/geleneği, sinema tarihindeki yeri, etkilendiği veya etkilediği eserler.\n"
            "- En az bir entelektüel kıyas veya gönderme yap (başka bir yönetmen, akım, felsefi kavram ya da sanatsal disiplinle ilişki kur) — ama snobluk değil, içten bir bilgelikle.\n"
            "- HER FİLM İÇİN FARKLI VE ÖZGÜN bir not yaz. Klişe kalıplar, 'güzel film', 'kaçırılmaz', 'başyapıt' gibi içi boş övgüler YASAK.\n"
            "- Öznel ve bilge ol: 'Cannes'da ilk izlediğimde...', 'Bu, Antonioni'nin yabancılaşma temasının çağdaş bir yankısı' gibi — ama anlaşılır kal, akademik jargonda boğma.\n"
            "- Keskin ve yoğun: Her cümle bir fikir taşısın. Dolgu cümle YASAK. Spoiler YASAK.\n\n"
            "Örnek iyi notlar (entelektüel ton):\n"
            "- 'Üstadın Notu: Villeneuve burada Tarkovski'nin tefekkür ritmini blockbuster ölçeğine taşıyor — çöl, Lawrence of Arabia'daki gibi bir manzara değil, varoluşsal bir boşluk. Greig Fraser'ın ışığı dini bir resme yakın; kader ve irade arasındaki gerilimi diyalog değil mizansen anlatıyor.'\n"
            "- 'Üstadın Notu: Bong Joon-ho, sınıf çatışmasını dikey bir mimariye kodluyor — merdiven, Eisenstein'ın diyalektik kurgusunun mekânsal hâli. Tür sineması ile toplumsal eleştiriyi Parazit'te olduğu gibi aynı karede eritmesi, onu çağımızın en politik biçimcisi yapıyor.'\n"
            "- 'Üstadın Notu: Tarkovski zamanı bir madde gibi yontuyor; bu, kurgunun değil, sürenin (durée) sineması — Bergson'un felsefesinin perdedeki karşılığı. Sabır isteyen ama karşılığında imgenin saf ağırlığını veren bir tefekkür ayini.'\n"
            "- 'Üstadın Notu: Lynch burada anlatıyı değil, bilinçaltını kurguluyor — rüya mantığı Buñuel'den miras, ama tekinsizlik tamamen kendine ait. Akıl aramayı bırakıp teslim olduğunda film seni içine çekiyor.'\n\n"
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

        prompt = f"""Sen 25 yılını sinemaya adamış, Cannes, Sundance ve Berlin'i avucunun içi gibi bilen, sofistike, entelektüel ve derin bir sinema eleştirmenisin (Üstat/Gurme).
Üslubun bilge, samimi, hafif melankolik ve her zaman merak uyandırıcı olmalı. "Evlat", "Başyapıt", "Tozlu Raflar" gibi sıcak ifadeler kullanırsın.
Kullanıcı ruh halini şöyle anlatıyor: "{user_text}"

Görevin: Kullanıcının enerji seviyesini, duygusal tonunu, alt metnini ve sinemasal ihtiyacını derinlemesine analiz et.

YAZIM HATASI TESPİTİ (Fuzzy Matching & Typo Correction):
Kullanıcı film adı veya yönetmen/oyuncu adı yazmış ama hatalı yazmış olabilir:
- "Inseptiyon" / "inseption" → "Inception" (Başlangıç)
- "Intersteler" / "interstellar" → "Interstellar" (Yıldızlararası)
- "Tarantıno" → "Tarantino"
- "Kofman" → "Kaufman" (Charlie Kaufman)
- "Se7en" → doğru zaten
- "finit dövüş kulübü" → "Fight Club"
Eğer bir yazım hatası ya da yaklaşık yazım tespit edersen:
- correction_detected: true
- corrected_text: "Evlat, '[yanlış yazım]' derken [doğru ad]'ı kastettin herhalde... [kısa Üstad yorumu]"
Eğer yazım hatası yoksa:
- correction_detected: false
- corrected_text: null

BAĞLAM BOYUTLARI (3-Dimensional Context Matrix):
Kullanıcının sorgusundan şu 3 boyutu çıkar ve mood seçiminde kullan:

A) Atmosfer/Mevsim (atmosphere): "yaz gecesi", "kışın kar", "sonbahar", "yağmurlu gün", "sıcak", "soğuk" vb.
   Bulamazsan: null
B) Eşlik Bağlamı (companion): "yalnız", "sevgilimle", "ailemle", "arkadaşlarla", "çocuklarla"
   Bulamazsan: null
C) Örtük Ruh Hali (implicit_mood): A ve B'nin sinemasal birleşimi — 1 cümle

Bu boyutlar mood seçimini doğrudan etkiler (örnekler):
- "sevgilimle + yaz akşamı" → askbahcesi/battaniye, sıcak romantik
- "arkadaşlarla + gece" → kahkaha/adrenalin, yüksek enerji
- "yalnız + kış gecesi" → sessiz/kalp/gozyasi, içe dönük
- "ailemle + hafta sonu" → battaniye/yolculuk, herkese uygun
- "çocuklarla" → battaniye (animasyon dahil), karanlık/korku ASLA
- "iş çıkışı yorgun" → battaniye/sessiz, düşük enerji
- "stres var kafamı dağıtayım" → kahkaha/adrenalin, yüksek enerji

14 Mood Tanımları:
- battaniye: Sıcak, rahat, ev hissi, kahve/çay/battaniye, feel-good. Yormaz, sarar. [Battaniye Modu]
- yolculuk: Keşif, yol, uzak yerler, macera, içsel veya fiziksel yolculuk. Ufuk açar. [Yolculuk Ruhu]
- gece: Karanlık şehir, suç, gizem, noir, uykusuzluk. Sokak lambaları, neon. [Gece Kuşu]
- kahkaha: Komedi, gülmek, rahatlamak, kafayı dağıtmak. Hafif ve eğlenceli. [Kahkaha Molası]
- gozyasi: Duygusal yoğunluk, ağlamak, aşk acısı, aile/kayıp dramı. Katarsis. [Gözyaşı Gecesi]
- adrenalin: Aksiyon, tempo, heyecan, tehlike, yüksek enerji. Koltuğun kenarı. [Adrenalin Patlaması]
- askbahcesi: Romantik, sıcak, kırılgan, aşk hissi. Kalpte kelebekler. [Aşk Bahçesi]
- zamanyolcusu: Tarih, dönem filmi, klasik/vintage sinema, nostalji. [Zaman Yolcusu]
- sessiz: Sakin, minimal, içe dönük, yavaş, düşündüren. Gözlem ve his. [Sessiz Yolculuk]
- zihin: Puzzle, twist, karmaşık planlar, mind-game. Beyin jimnastiği. [Zihin Savaşı]
- kalp: Bağımsız sinema, art house, festival filmleri. Blockbuster dışı, karakter odaklı, yaratıcı. [Kalbimin Sesi]
- karmakar: Gerçeküstü, deneysel, tuhaf, mantığın büküldüğü. Rüya gibi. [Karmaşakar]
- Retro: 80s synthwave, neon, VHS, arcade, retro estetik. Zaman makinesi. [Retro Bakış]
- deep-chills: Slow-burn atmosferik korku/gerilim, ürperti. Tedirgin edici. [Derin Ürperti]

KRİTİK NÜANS KURALLARI (bu kurallar mood seçiminde belirleyicidir):

Enerji & Yorgunluk:
- "yorgun" / "bitkin" / "uykusuz" → düşük enerji. battaniye/sessiz/kalp. Adrenalin/kahkaha DEĞİL.
- "yorgun ama boş olmasın" → kalp/sessiz (anlamlı ama yormayan). Kahkaha DEĞİL.
- "kafamı dağıtmak istiyorum" → kahkaha/battaniye (hafif). Gozyasi/deep-chills DEĞİL.
- "enerjik" / "heyecanlı" → adrenalin/yolculuk/kahkaha.

Ton & Karanlık:
- "karanlık" + "kaliteli" → gece/zihin/deep-chills (kaliteli noir/gerilim).
- "karanlık ama ucuz olmasın" → gece/zihin (ucuz slasher değil). Deep-chills ikincil.
- "gerilmek" / "korkmak" → deep-chills/gece.
- "ürpertici ama akıllı" → deep-chills/zihin.
- "kasvetli" / "bunaltıcı olmasın" → battaniye/yolculuk/kahkaha (kaçış).

Romantizm:
- "romantik" normal → askbahcesi ağırlıklı.
- "romantik ama klişe olmasın" → kalp (indie romantik) / gozyasi (derin). Askbahcesi DEĞİL.
- "aşk filmi ama ağlatan" → gozyasi ağırlıklı, askbahcesi ikincil.
- "tatlı/şirin" → battaniye/askbahcesi.
- KRİTİK: "sevgilimle" / "partnerimle" / "eşimle" + "şehvetli" / "tutkulu" / "ateşli" / "erotik" / "baştan çıkarıcı" / "çift gecesi" / "romantik gece" → askbahcesi BİRİNCİL (yüksek ağırlık), ikincil gozyasi veya gece. Bu KESİNLİKLE battaniye DEĞİL — "sıcak/rahat ortam" diye yorumlama. Burada istenen yoğun romantik/tutkulu atmosfer; primary_mood="askbahcesi", prefer'a "sensual_romance"/"passionate" ekle.
- "çiftlere film" / "ikimiz için" / "date night" → askbahcesi birincil, battaniye ikincil olabilir ama asla tek başına battaniye değil.

Düşünce & Derinlik:
- "düşündüren" / "sorgulatan" → zihin/kalp.
- "beyin yakan" / "twist" → zihin ağırlıklı.
- "boş olmasın" / "içi dolu" → kalp/sessiz/zihin. Kahkaha DEĞİL.
- "felsefi" / "varoluşsal" → karmakar/sessiz/kalp.

Hafiflik:
- "gülmek istiyorum" → kahkaha ağırlıklı.
- "ağır olmasın" → kahkaha/battaniye/yolculuk. Deep-chills/gozyasi DEĞİL.
- "rahatlatıcı" → battaniye/sessiz.
- "hafif ama içi dolu" → battaniye/kalp/sessiz.
- "stres atayım" → kahkaha/adrenalin.

Nostalji & Dönem:
- "nostaljik/eski" → zamanyolcusu veya Retro.
- "80ler/neon/VHS/synth" → Retro (80s estetiği).
- "tarih/dönem/kostüm" → zamanyolcusu.
- "klasik sinema" → zamanyolcusu.

Özel Durumlar:
- "sıradışı/garip/tuhaf" → karmakar.
- "bağımsız/indie/festival" → kalp.
- "macera/yolculuk/keşif" → yolculuk.
- Kısa/belirsiz mesajlar → primary_mood'u en güçlü ipucuna göre seç, mood_mix geniş tut.
- Çelişkili istekler ("korkunç ama komik") → en baskın duyguyu primary yap, diğerini secondary.

Enerji seviyesi (energy_level):
- low: yorgun, sakin, dinlenmek istiyor
- medium: nötr, dengeli
- high: enerjik, heyecanlı, aktif

Duygusal ağırlık (emotional_weight):
- light: hafif, eğlenceli
- medium: dengeli
- heavy: derin, ağır, yoğun

Tempo (pace):
- slow: yavaş, meditatif
- medium: orta
- fast: hızlı, dinamik

Karanlık seviyesi (darkness_level):
- light: parlak, aydınlık
- neutral: dengeli
- dark: karanlık, kasvetli
- very_dark: çok karanlık, ağır

Karmaşıklık (complexity):
- easy: sade, anlaşılır
- medium: orta düzey
- complex: karmaşık, katmanlı

Üstad'ın Sinemasal Satırı (ustad_line):
- Kısa (1-2 cümle), şiirsel, sinemasal bir Türkçe cümle. Bir danışmanın değil, bir ustanın sesi.
- Filmleri spoile etme. Kullanıcının hissini yansıt.

FİLM ÖZEL TAHMİN KURALLARI:
- Kullanıcının yazdığı her kelimeyi bir film sahnesine bağla. "yağmur" → Shawshank, Blade Runner. "yalnızlık" → Her, Lost in Translation.
- Kullanıcı kısa/belirsiz yazsa bile, en olası 3-5 film aklında tut ve mood_mix'i buna göre ağırlıkla.
- "gibi bir film" ifadesi gelirse, o filmin türünü, tonunu, temposunu ve atmosferini analiz edip en yakın mood'u seç.
- Türkçe günlük dildeki duygu ifadelerini çöz: "içim sıkılıyor" → kahkaha/battaniye, "kafam dağınık" → sessiz/kalp, "delirmek üzereyim" → adrenalin/karmakar.
- Mevsim/hava durumu ipuçları: "yağmurlu" → battaniye/sessiz/gozyasi, "sıcak yaz gecesi" → gece/adrenalin, "kar yağıyor" → battaniye/zamanyolcusu.
- Kullanıcı spesifik bir sahne/his tarif ediyorsa (örn. "arabada müzik dinleyerek yolda gitmek") → bunu en iyi karşılayan mood'u birincil yap.

VARLIK ÇIKARIMI (Entity Extraction):
Kullanıcının metninde geçen film adları ve kişi adlarını tespit et:
- Film adları: Türkçe veya İngilizce, ek almış olabilir ("Inception'daki", "interstellar tadında", "Başlangıç'taki"). Ekleri temizle, saf film adını yaz.
- Kişi adları: Oyuncu veya yönetmen, Türkçe iyelik/hal ekleriyle olabilir ("Nolan'ın", "Al Pacino'nun", "brad pitt'in"). Ekleri temizle, saf ismi yaz.
- Niyet ipucu (intent_hint): Kullanıcı bu referansla ne yapmak istiyor?
  - "similar": benzer film istiyor ("gibi", "tarzında", "tadında", "benzeri", "o havada", "o tarz")
  - "lookup": filmi bulmak/bilgi almak istiyor
  - "mood_inspired": referansı sadece atmosfer/ruh hali için kullanıyor, spesifik benzer film beklemiyor
  - "none": hiçbir film/kişi tespit edilemedi

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

        try:
            # Hızlı model (Haiku) — yapısal çıkarım, latency-kritik.
            # Haiku başarısız/yetersizse aşağıdaki except + rule-based devreye girer.
            message = await self.client.messages.create(
                model=self.fast_model, max_tokens=900,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            result = json.loads(response_text)
            if result.get("primary_mood") and result.get("mood_mix"):
                return result
        except Exception as e:
            print(f"Claude extract_user_intent error: {e}")

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

        prompt = f"""Sen 25 yılını sinemaya adamış, bilge ve samimi bir sinema eleştirmenisin (Üstat/Gurme).
Üslubun: entelektüel ama sıcak, "Evlat" der gibi konuşursun. Jargon yok, içtenlik var.

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
2. Eğer eşlik bağlamı varsa (sevgilimle/ailemle/yalnız): o bağlama uygunluk kritik
3. Eğer mevsim/atmosfer varsa: film paleti ve tonu buna uygun olmalı
4. Filmin genel tonu ve temposu kullanıcının enerji seviyesiyle uyumlu mu?
5. Çeşitlilik: Aynı türden art arda 3+ film seçme.

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
            print(f"Claude rerank_movies error: {e}")

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
