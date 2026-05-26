"""
LLM-powered Intent Parser — Claude Haiku tabanlı niyet çözümleme.

Kafan mı Karışık chat engine'inin PATH 2 aşamasında kullanılır.
Kullanıcının serbest metin sorgusunu yapısal JSON'a dönüştürür:
  - Film/oyuncu/yönetmen varlıkları
  - Tür filtreleri (istenen + dışlanan)
  - Ruh hali sinyalleri
  - Kısıtlamalar (yıl, puan, süre)
  - Semantik arama için optimize edilmiş sorgu metni

Fallback: API key yoksa, timeout olursa veya JSON parse hatası olursa
None döner — çağıran kod mevcut regex-only akışa devam eder.

Latency budget: ~100-300ms (Haiku hızlı)
Bellek: ihmal edilebilir (tek API çağrısı, model yüklemesi yok)
"""

import json
import logging
import asyncio
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("intent_parser")


# ═══════════════════════════════════════════════════════════════════════════════
# DATA CLASS
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class LLMIntent:
    """Claude Haiku'nun döndürdüğü yapısal niyet verisi."""
    intent_type: str = "mood_search"
    entities: dict = field(default_factory=lambda: {"titles": [], "actors": [], "directors": []})
    genre_ids: list = field(default_factory=list)
    excluded_genre_ids: list = field(default_factory=list)
    mood_signals: list = field(default_factory=list)
    constraints: dict = field(default_factory=lambda: {
        "min_year": None, "max_year": None,
        "min_rating": None, "max_duration": None,
        "negations": [],
    })
    search_query: str = ""
    confidence: float = 0.0

    def has_entities(self) -> bool:
        e = self.entities
        return bool(e.get("titles") or e.get("actors") or e.get("directors"))

    def has_genre_filter(self) -> bool:
        return bool(self.genre_ids or self.excluded_genre_ids)


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

INTENT_SYSTEM_PROMPT = """Sen bir Türkçe film arama motoru için niyet çözümleyicisisin. Kullanıcının yazdığı serbest metni analiz et ve yapısal JSON'a dönüştür. Görevin: film önerisi aramalarını anlamak, varlıkları (film adı, oyuncu, yönetmen) çıkarmak, türleri/ruh hallerini tespit etmek ve semantik arama için optimize edilmiş bir sorgu üretmek.

KURALLAR:
- Türkçe film adlarını İngilizce karşılıklarına çevir (Başlangıç→Inception, Esaretin Bedeli→The Shawshank Redemption, Zindan Adası→Shutter Island, Yıldızlararası→Interstellar, Dövüş Kulübü→Fight Club, Ucuz Roman→Pulp Fiction, Prestij→The Prestige, Kara Şövalye→The Dark Knight, vb.)
- Yazım hatalarını düzelt (Intersellar→Interstellar, Tarantno→Tarantino, Nuri Bilge→Nuri Bilge Ceylan, Kubrik→Kubrick, Vilenöv→Villeneuve)
- Olumsuzluk/dışlama ifadelerini yakala ("korku olmasın", "klişe değil", "romantik hariç")
- Dönem/yıl kısıtlamalarını çıkar ("2000'lerden"→min_year:2000/max_year:2009, "90'lar"→min_year:1990/max_year:1999, "yeni filmler"→min_year:2020, "eski klasikler"→max_year:1990)
- IMDb/puan kısıtlamalarını çıkar ("IMDb 8 üstü"→min_rating:8.0, "yüksek puanlı"→min_rating:7.5)
- Süre kısıtlamalarını çıkar ("kısa"→max_duration:90, "2 saatten az"→max_duration:120, "vaktim yok"→max_duration:90)
- Atmosferik/durumsal ifadelerden ruh hali sinyalleri üret (aşağıdaki BAĞLAM bölümüne bak)
- Birden fazla varlık varsa hepsini çıkar
- Kullanıcı Türkçe yazıyor ama search_query alanı İngilizce/Türkçe karışık olabilir (semantic engine multilingual)
- search_query alanı semantik arama motoruna verilecek — film bulmak için optimize et (ör. "psychological thriller similar to Shutter Island with mind-bending plot twists" gibi açıklayıcı bir sorgu)

YÖNETMEN TANIMA:
- Sadece soyadı geçse bile yönetmeni tanı: "Nolan", "Tarantino", "Kubrick", "Villeneuve", "Scorsese", "Fincher", "Ceylan", "Lynch", "Wes Anderson", "Spielberg", "Hitchcock", "Ridley Scott", "Yılmaz Güney", "Ferzan Özpetek", "Zeki Demirkubuz", "Semih Kaplanoğlu"
- Tam adını yaz: "Nolan" → directors: ["Christopher Nolan"], "Tarantino" → directors: ["Quentin Tarantino"], "Ceylan" → directors: ["Nuri Bilge Ceylan"]
- "X filmleri", "X'in çektiği", "X gibi çeken", "X tarzı yönetmenler" → intent_type: "director_filmography"
- "X tarzında filmler" (yönetmen adıysa) → intent_type: "director_filmography" + search_query: "films similar to [director]'s style"

BAĞLAM BAZLI ANLAMA:
- "sevgilimle" / "romantik gece" / "şehvetli" / "tutkulu" → genre_ids: [10749], mood_signals: ["romantik"], search_query: intimate/romantic/passionate films
- "ailemle" / "aile filmi" / "hep birlikte" → genre_ids: [10751, 35], mood_signals: ["huzurlu", "neşeli"], search_query: family-friendly
- "çocuğuma" / "çocuklar için" / "çocuk filmi" → genre_ids: [16, 10751], mood_signals: ["neşeli"], search_query: animated family children movie
- "arkadaşlarla" / "eğlenceli gece" → genre_ids: [35], mood_signals: ["neşeli"], search_query: fun group comedy
- "yalnızken" / "tek başıma" / "kafa dinle" → mood_signals: ["huzurlu", "düşündürücü"], search_query: introspective solo viewing
- "uyumadan önce" / "gece geç" → mood_signals: ["huzurlu", "karanlık"], search_query: late-night contemplative
- "ağlatacak" / "ağlamak istiyorum" → mood_signals: ["duygusal", "hüzünlü"], search_query: emotional tearjerker drama

INTENT TİPLERİ:
- similar_to_movie: Bir filme benzer öneriler ("X gibi", "X tarzında", "X'e benzer")
- actor_filmography: Oyuncunun filmleri ("Brad Pitt filmleri", "X'in oynadığı")
- director_filmography: Yönetmenin filmleri ("Nolan'ın çektiği", "Tarantino filmleri", "Kubrick gibi")
- genre_request: Tür bazlı arama ("bilim kurgu öner", "komedi istiyorum")
- mood_search: Ruh hali/atmosfer/bağlam bazlı ("rahatlatıcı", "gerilimli", "ağlatacak", "sevgilimle", "ailemle")
- complex_query: Birden fazla kısıt kombinasyonu ("2000'lerden psikolojik gerilim ama korku olmasın")
- feedback: Önceki önerilere tepki ("daha farklı", "bunları izledim", "daha karanlık")

TMDB TÜR ID'LERİ (genre_ids alanı için bu ID'leri kullan):
28=Aksiyon, 12=Macera, 16=Animasyon, 35=Komedi, 80=Suç, 99=Belgesel, 18=Dram, 10751=Aile, 14=Fantezi, 36=Tarih, 27=Korku, 10402=Müzik, 9648=Gizem, 10749=Romantik, 878=Bilim Kurgu, 53=Gerilim, 10752=Savaş, 37=Western

RUH HALİ SİNYALLERİ (mood_signals alanı için bu terimlerden uygun olanları kullan):
gerilimli, psikolojik, karanlık, huzurlu, rahatlatıcı, neşeli, romantik, duygusal, hüzünlü, aksiyonlu, heyecanlı, nostaljik, ürpertici, felsefi, düşündürücü, macera, epik, samimi, melankolik, absürt, minimalist, görsel

JSON ÇIKTISI (sadece geçerli JSON, başka hiçbir şey yazma — yorum, açıklama, markdown yok):
{
  "intent_type": "similar_to_movie|actor_filmography|director_filmography|genre_request|mood_search|complex_query|feedback",
  "entities": {
    "titles": ["İngilizce Film Adı"],
    "actors": ["Tam Oyuncu Adı"],
    "directors": ["Tam Yönetmen Adı"]
  },
  "genre_ids": [28, 53],
  "excluded_genre_ids": [27],
  "mood_signals": ["gerilimli", "psikolojik"],
  "constraints": {
    "min_year": null,
    "max_year": null,
    "min_rating": null,
    "max_duration": null,
    "negations": ["klişe olmasın"]
  },
  "search_query": "Semantik arama için optimize edilmiş sorgu",
  "confidence": 0.95
}"""


# ═══════════════════════════════════════════════════════════════════════════════
# INTENT PARSER SERVICE
# ═══════════════════════════════════════════════════════════════════════════════

class IntentParser:
    """
    Claude Haiku ile kullanıcı metnini yapısal niyet verisine dönüştürür.
    Lazy init: ilk çağrıda client oluşturulur (bellek dostu).
    """

    def __init__(self):
        self._client = None
        self._model = None

    def _get_client(self):
        """Lazy init — sadece gerçekten çağrıldığında import/oluştur."""
        if self._client is None:
            from backend.config import ANTHROPIC_API_KEY, CLAUDE_FAST_MODEL
            if not ANTHROPIC_API_KEY:
                raise RuntimeError("ANTHROPIC_API_KEY tanımlı değil")
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            self._model = CLAUDE_FAST_MODEL
        return self._client, self._model

    async def parse(self, user_text: str, timeout: float = 2.0) -> Optional[LLMIntent]:
        """
        Kullanıcı metnini Claude Haiku ile parse et.

        Returns:
            LLMIntent: Başarılı parse sonucu
            None: Herhangi bir hata durumunda (API yok, timeout, parse hatası)
        """
        if not user_text or len(user_text.strip()) < 3:
            return None

        try:
            client, model = self._get_client()
        except RuntimeError:
            return None  # API key yok → sessiz fallback

        try:
            message = await asyncio.wait_for(
                client.messages.create(
                    model=model,
                    max_tokens=400,
                    system=INTENT_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_text.strip()}],
                ),
                timeout=timeout,
            )

            response_text = message.content[0].text.strip()

            # Markdown code fence'leri temizle (bazı modeller ekleyebilir)
            if response_text.startswith("```"):
                # ```json\n...\n``` veya ```\n...\n```
                lines = response_text.split("\n")
                # İlk ve son satırı at
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            data = json.loads(response_text)

            intent = LLMIntent(
                intent_type=data.get("intent_type", "mood_search"),
                entities=data.get("entities", {"titles": [], "actors": [], "directors": []}),
                genre_ids=[int(g) for g in data.get("genre_ids", []) if str(g).isdigit()],
                excluded_genre_ids=[int(g) for g in data.get("excluded_genre_ids", []) if str(g).isdigit()],
                mood_signals=data.get("mood_signals", []),
                constraints=data.get("constraints", {}),
                search_query=data.get("search_query", user_text),
                confidence=float(data.get("confidence", 0.5)),
            )

            logger.info(
                "[IntentParser] OK: type=%s, entities=%s, genres=%s, confidence=%.2f, query='%s'",
                intent.intent_type,
                {k: v for k, v in intent.entities.items() if v},
                intent.genre_ids,
                intent.confidence,
                intent.search_query[:60],
            )
            return intent

        except asyncio.TimeoutError:
            logger.warning("[IntentParser] Haiku timeout (%.1fs): '%s'", timeout, user_text[:50])
            return None
        except json.JSONDecodeError as e:
            logger.warning("[IntentParser] JSON parse hatası: %s | response: '%s'", e, response_text[:100] if 'response_text' in dir() else "?")
            return None
        except Exception as e:
            logger.warning("[IntentParser] Beklenmeyen hata: %s", e)
            return None


# Singleton — tüm uygulama tek instance kullanır
intent_parser = IntentParser()
