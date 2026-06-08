"""
Sıfır-maliyet "Üstad Notu" üreticisi.

Claude çağrısı YAPMAZ. Filmin meta verisinden (başlık, tür, yıl, yönetmen, mood)
deterministik bir not kurar. Determinizm `hashlib.md5` ile sağlanır → aynı film,
süreç yeniden başlasa bile aynı notu alır (Python `hash()` süreç-başı tuzlandığı
için kullanılmaz).

Ton: 20 yıllık bir film eleştirmeni — ÖLÇÜLÜ, DÜRÜST, sayı saymadan. PUANDAN
SÖZ ETMEZ; değerlendirmeyi yalnız kelimelerle yapar. Yine de filmin puanına göre
KADEMELENİR (içeride eşik kullanılır, ekranda gösterilmez):
  - Yüksek (≥7.5): gerçek övgü.
  - Orta (6.0–7.5): dengeli, "başyapıt değil ama işini biliyor".
  - Düşük (<6.0): dürüst/eleştirel — abartılı övgü YOK.
  - Puansız: temkinli, "keşif kumarı".
Düşük/puansız filmlerde coşkulu mood cümlesi eklenmez.

Çeşitlilik: her cümle slotu BAĞIMSIZ hash ile seçilir (opening/verdict/texture/
craft/closing). Büyük havuzlarla on binlerce kombinasyon → filmden filme belirgin
fark. Bu üretici sürümü değiştikçe TEMPLATE_VERSION artar; main.py eski şablon
notlarını görüntülenince sıfır maliyetle yeniler (Claude notlarına dokunmaz).

Hafif tutuldu: numpy/SDK gibi ağır bağımlılık import EDİLMEZ.
"""
import hashlib
import re

# Bu üretici her anlamlı değişiklikte artır → eski template notları otomatik yenilenir.
TEMPLATE_VERSION = "ustad-3"

# TMDB tür ID → Türkçe ad.
_GENRE_NAMES = {
    28: "aksiyon", 12: "macera", 16: "animasyon", 35: "komedi",
    80: "suç", 99: "belgesel", 18: "drama", 10751: "aile",
    14: "fantastik", 36: "tarih", 27: "korku", 10402: "müzik",
    9648: "gizem", 10749: "romantik", 878: "bilim kurgu",
    10752: "savaş", 53: "gerilim", 37: "western",
}

# mood_id → kapanışa eklenen atmosfer cümlesi (yalnız önerilen/yüksek-orta filmlerde).
_MOOD_CLOSINGS = {
    "battaniye":          "Sıcaklığı, hiç zorlamadan insanı içine alıyor.",
    "yolculuk":           "Keşif duygusuyla seni alıp uzak diyarlara bırakıyor.",
    "gece":               "Loş atmosferi gecenin ruhuna eksiksiz oturuyor.",
    "kahkaha":            "Hafifliğiyle zihni dağıtmaya birebir geliyor.",
    "gozyasi":            "Duygusal derinliği, sessizce ve usulca içine işliyor.",
    "adrenalin":          "Temposuyla seni koltuğun ucuna çekiyor.",
    "askbahcesi":         "İnce romantik dokusuyla kalbi ısıtıyor.",
    "zamanyolcusu":       "Nostaljik havasıyla insanı geçmişe doğru çekiyor.",
    "sessiz":             "Dinginliğiyle bu geceye sessizce eşlik ediyor.",
    "zihin":              "Düşündüren kurgusuyla zihni günlerce meşgul ediyor.",
    "kalp":               "Küçük ama yürekten gelen bir hikâye anlatıyor.",
    "karmakar":           "Deneysel diliyle alışılmışın hayli dışına taşıyor.",
    "sipsak":             "Derli toplu yapısıyla vaktine saygı gösteriyor.",
    "deep-chills":        "Usul usul yükselen gerilimiyle tüyleri diken diken ediyor.",
    "kadraj-estetigi":    "Görsel şiirselliğiyle gözü fazlasıyla doyuruyor.",
    "geceyarisi-itirafi": "Samimi atmosferiyle gecenin geç saatlerine yakışıyor.",
}

# ── Açılış: tarafsız, eleştirmen ağzı sahneyi kurar ──
_OPENINGS = [
    "{title}, {year} yapımı bir {genre} olarak masama düştü.",
    "{title}'a yıllardır {genre} izleyen birinin gözüyle yaklaştım.",
    "{title}'ı {year}'ın değil, bugünün terazisinde tarttım.",
    "Perde aralandığında {title} niyetini gizleme gereği duymuyor.",
    "{genre} rafının neresine düşüyor {title}, ona bakalım.",
    "{title}, {year}'dan bu yana ayakta kalmış bir {genre} denemesi.",
    "{title} izlenirken not defterim hiç kapanmadı.",
    "Peşinen söyleyeyim: {title} daha ilk sahnede tavrını koyuyor.",
    "{title}'ı türünün has örnekleriyle aynı kefeye koydum.",
    "{year} yapımı {title} karşıma çıktığında kahvem henüz soğumamıştı.",
    "{title}, {genre} kalabalığının içinde kendi sesini kovalıyor.",
    "Bir {genre} olarak {title}'ın derdi daha ilk dakikada okunuyor.",
    "{title} izlenirken kalemi bir an elimden bırakmadım.",
    "{year}'ın {genre} ikliminde {title} kolay kolay göz ardı edilmiyor.",
]

# ── Hüküm: PUAN KADEMESİNE göre çekirdek değerlendirme (SAYI YOK) ──
_VERDICT_HIGH = [
    "Açık söyleyeyim: bu iş hakkıyla kotarılmış, ustalık her karede kendini belli ediyor.",
    "Yönetmenlik, senaryo ve ritim aynı hizada akıyor; türünün üst rafına yerleşiyor.",
    "Ender filmlerden — kalıpları esnetiyor, kendi kurallarını kendi koyuyor.",
    "Bu denli dengeli kotarılmış bir {genre} seyrek görülür; her parçası yerli yerinde.",
    "Karakterleri kâğıttan değil; etiyle kemiğiyle perdede duruyorlar.",
    "Final geldiğinde insana 'işte sinema bu' dedirten cinsten.",
    "Zanaatkârlık her sahneye sinmiş; {title} alışkanlıkları sarsıyor.",
    "Yılda bir çıkar böylesi; o sayılı örneklerden biri.",
    "Duyguyla aklın terazisini şaşırtmadan tutan ender yapımlardan.",
    "İlk izleyişte çarpıyor, ikincisinde katmanlarını açıyor.",
    "Cesaretini ortaya koyup riskini kazanca çeviren bir {genre}.",
    "Lafı dolandırmadan söyleyeyim: bu film türüne duyulan saygıyı hak ediyor.",
]
_VERDICT_MID = [
    "Başyapıt değil ama işinin ehli; dürüst bir film.",
    "Ne göklere çıkarılır ne de boşa geçen vakit — tam ortada, keyifli duruyor.",
    "Sağlam bir {genre}; birkaç pürüzü var, yine de genelinde doyurucu.",
    "İddiası yok ama namusu yerinde bir film.",
    "Zirveyi zorlamıyor, ama seni yarı yolda da bırakmıyor.",
    "Parlak anları gerçekten parlak, zayıf anları bağışlanır; dengeli bir seyir.",
    "Büyük laflar etmeden, sessiz sedasız işini görüyor.",
    "Tür kalıplarının içinde kalıyor, ama bunu temiz bir el işçiliğiyle yapıyor.",
    "Göz kamaştırmıyor, yine de tatmin bırakan bir {genre}.",
    "Beklentini ölçülü tutarsan tadını alırsın; fazlasını da vaat etmiyor.",
    "Sağlam bir senaryo, ölçülü bir oyunculuk; iddiasız ama derli toplu.",
    "Pürüzleri göze çarpıyor, yine de bütününe söz söyletmiyor.",
]
_VERDICT_LOW = [
    "Açık konuşayım: türünün güçlü kanadında durmuyor.",
    "Senaryosu ve ritmi tökezliyor; iyi niyetli ama topu taca atan bir {genre}.",
    "Yıllardır {genre} izlerim; {title} ortalamanın bir tık altında kalıyor.",
    "Fikri fena değil, gel gör ki uygulaması zayıf düşmüş.",
    "Parlak anları yok değil, ne yazık ki azınlıkta; bütünü bir arada tutamıyor.",
    "Beklentini yüksekten tutma — {title} verdiği sözü yerine getirmiyor.",
    "Oyunculuğu da kurgusu da varmak istediği yere ulaşamıyor.",
    "Ara ara toparlanıyor, ama genelinde dağınık bir {genre}.",
    "Niyeti büyük, eline geçeni vasat; potansiyelini harcayıp geçiyor.",
    "Türün has örneklerini görmüş bir göze {title} sönük kalıyor.",
    "Bir iki sahnesi suyun üstünde tutuyor, gerisi akıp gidiyor.",
    "İddiasını taşıyacak omurgadan yoksun kalmış.",
]
_VERDICT_UNKNOWN = [
    "Hakkında doğru dürüst iz yok; düpedüz bir keşif kumarı.",
    "Geniş kitleyle buluşmamış bir {genre}; cevher de çıkabilir, hüsran da.",
    "Radarın epeyce dışında kalmış filmlerden; riski göze alana göre.",
    "Üzerine konuşan pek olmamış; {title} kısmetini izleyende arıyor.",
    "Tanınırlığı düşük; türün meraklısı değilsen temkinli yaklaş.",
    "Az bilinen bir yapım; ne vaat ettiği baştan pek belli olmuyor.",
    "Gölgede kalmış bir {genre}; gün yüzüne çıkmayı hâlâ bekliyor.",
    "Adı pek duyulmamış; ama cesaret edene kapısını aralıyor.",
]

# ── Doku: tier'a göre kısa ikinci gözlem (yönetmen yoksa orta cümle olur) ──
_TEXTURE_HIGH = [
    "Atmosferi elindeki en güçlü koz.", "Kurgusu zekice örülmüş, tek bir sahne fazlalık değil.",
    "Görüntü dili anlatının önüne geçmeden ona kusursuz hizmet ediyor.",
    "İnce detayları ikinci izleyişte kendini ele veriyor.", "Temposunu sonuna dek elinden bırakmıyor.",
    "Oyuncular rollerini taşımıyor, giyinmiş.", "Sessizliklerinde bile bir anlam saklı.",
]
_TEXTURE_MID = [
    "Birkaç sahnesi akılda iz bırakıyor.", "Sıradan bir akşamı gönül rahatlığıyla kurtarır.",
    "Beklenmedik bir iki kıvrımı var.", "Temposu yer yer düşse de kendini toparlıyor.",
    "Oyunculukları yeterince inandırıcı duruyor.", "Görüntüsü temiz, derdini anlaşılır anlatıyor.",
    "Ne eksiği var ne fazlası, dengeli bir iş.",
]
_TEXTURE_LOW = [
    "Birkaç sahnesi dışında akılda tutunamıyor.", "Fikrinin gölgesinde kalmış bir uygulama.",
    "Doğrusu daha cesur olabilirdi.", "Temposu dağılıyor, ilgi elden kaçıyor.",
    "Oyunculukları filmi kurtarmaya yetmiyor.", "Görseli de derdini taşımakta zorlanıyor.",
    "Sonu, başında verdiği sözü tutmuyor.",
]
_TEXTURE_UNKNOWN = [
    "Kalabalıktan sıyrılmak için epey çabalıyor.", "Ne vaat ettiği hayli muğlak.",
    "Kendi yolunu ancak izleyende buluyor.", "Tanıtımı değil, izleyeni konuşturuyor.",
    "Üzerine kesin söz söylemek için henüz erken.",
]

# ── Zanaat: yalnız yönetmen biliniyorsa eklenir (nötr) ──
_CRAFT = [
    "Yönetmen {director}'in eli her sahnede sezilir.",
    "{director}'in tercihleri filme ayrı bir kimlik kazandırıyor.",
    "{director} kamerayı tam nereye koyacağını iyi biliyor.",
    "Arkasında {director} var; bu da başlı başına bir şey anlatıyor.",
    "{director}'in imzası filmin dokusuna sinmiş durumda.",
    "{director} filmin tonunu kurmayı ihmal etmemiş.",
]

# ── Ünlü yönetmen tanıma: genel _CRAFT yerine kişiye özel cümle ──
# Anahtar: soyadı (küçük harf). Birden fazla cümle → hash ile seçilir.
_KNOWN_DIRECTORS: dict[str, list[str]] = {
    "kubrick": [
        "Kubrick'in kadrajlarında tesadüf diye bir şey yoktur; her kare bir tablo gibi düşünülmüş.",
        "Kubrick titizliğiyle ünlüdür — burada da o inatçı mükemmeliyetçilik kendini ele veriyor.",
    ],
    "scorsese": [
        "Scorsese'nin sokağın ritmini sinemaya taşıma ustalığı burada da baskın.",
        "Scorsese bu işi yılların verdiği güvenle kotarıyor; müzik seçimleri bile başlı başına bir anlatı.",
    ],
    "nolan": [
        "Nolan'ın zamanla oynama merakı burada da devrede; kurguyu bir bulmacaya çeviriyor.",
        "Nolan alışıldık anlatıyı parçalayıp yeniden inşa ediyor; izleyiciyi pasif bırakmıyor.",
    ],
    "tarantino": [
        "Tarantino'nun diyalog yazarlığı burada da sivri; konuşmalar aksiyonun kendisi.",
        "Tarantino'nun müzik kullanımı ve şiddet estetiği bir kez daha imzasını atıyor.",
    ],
    "villeneuve": [
        "Villeneuve devasa ölçeği insani duyguyla dengelemeyi başaran ender yönetmenlerden.",
        "Villeneuve'ün görsel dili konuşmadan önce gelir; sessizlik burada bir tercih.",
    ],
    "spielberg": [
        "Spielberg'in büyük hikâyeleri sıcak tutma yeteneği burada da devrede.",
        "Spielberg duygusallığı hesaplı kullanır; tam dozajında, abartıya kaçmadan.",
    ],
    "fincher": [
        "Fincher'ın soğukkanlı görsel dili gerilimi lafla değil, kadrajla kuruyor.",
        "Fincher detaya gömülmüş bir yönetmen; arka plandaki ipuçları bile bilinçli.",
    ],
    "coppola": [
        "Coppola'nın büyük anlatıları küçük anlara sığdırma ustalığı burada kendini gösteriyor.",
        "Coppola operatik bir sinema dili kurar; sessizliği bile bir crescendo gibi işler.",
    ],
    "hitchcock": [
        "Hitchcock gerilimi nerede tutacağını iyi bilir; kadraja girmeyen şey seni tedirgin eder.",
        "Hitchcock'un 'suspense ustası' sıfatı boşuna değil — burada da izleyiciyi avucunda tutuyor.",
    ],
    "lynch": [
        "Lynch'in dünyasına adım attığında mantık kuralları askıya alınır; rüya ile kabus iç içe.",
        "Lynch'in bilinçaltı estetiği burada da tavan yapmış; rahatsız ama büyüleyici.",
    ],
    "anderson": [
        "Wes Anderson'ın simetrik kadraja olan takıntısı burada da müze kıvamında.",
        "Anderson'ın renk paleti ve tipografi fetişi filmi hareketli bir illüstrasyona çeviriyor.",
    ],
    "wong kar-wai": [
        "Wong Kar-wai'nin bulanık ışıklarla örülmüş melankolisi burada da nefes alıyor.",
        "Wong Kar-wai zamanı dondurmaz, eritir; her kare bir anının son titreşimi gibi.",
    ],
    "tarkovsky": [
        "Tarkovsky'nin uzun planları sabır ister ama ödülü büyüktür; sinema burada şiire dönüyor.",
        "Tarkovsky su, rüzgâr ve sessizlikle konuşur; burada da kelimeye ihtiyaç duymadan anlatıyor.",
    ],
    "kurosawa": [
        "Kurosawa'nın epik ölçeği ile insani detay arasındaki dengesi burada da hayranlık uyandırıyor.",
        "Kurosawa'nın hareket yönetimi bir dans koreografisi kadar hesaplı ve büyüleyici.",
    ],
    "bergman": [
        "Bergman yüz okur; yakın çekimleri bir psikanaliz seansından daha açıklayıcı.",
        "Bergman'ın varoluşsal sorguları burada da geçerliliğini koruyor; sinema felsefe oluyor.",
    ],
    "ceylan": [
        "Nuri Bilge Ceylan'ın sakin ritmine alışkınsan burada da kendini evinde hissedersin.",
        "Ceylan Anadolu'nun sessizliğini sinemaya döken ender isimlerden; burada da o huzur ve hüzün bir arada.",
        "Ceylan'ın uzun planları acele etmez; peyzaj bir karakter gibi konuşur.",
    ],
    "demirkubuz": [
        "Demirkubuz'un karanlık psikolojik portrelerinde teselli aramak boşuna; ama dürüstlüğü çarpıcı.",
        "Demirkubuz insanın karanlık tarafını amansızca sergiler; izlemesi zor ama kalıcı.",
    ],
    "turgul": [
        "Yavuz Turgul Türk sinemasının hikâye anlatma ustası; karakterleri sokaklardan çıkıp geliyor.",
        "Turgul'un kahramanları tanıdık gelir; mahallenden, çarşından, belki evinden birini izliyorsun.",
    ],
    "akin": [
        "Fatih Akın iki kültür arasındaki gerilimi yüreğe dokunan bir sinema diline çeviriyor.",
        "Fatih Akın'ın filmleri sınırları aşar; İstanbul ve Hamburg aynı hikâyenin iki yüzü.",
    ],
    "miyazaki": [
        "Miyazaki'nin dünyaları hayal gücünün sınırlarını zorluyor; her kare elle çizilmiş bir mucize.",
        "Miyazaki doğayla insanın barışını araştırır; çocuklara anlatır gibi yapıp yetişkinleri düşündürür.",
    ],
    "bong": [
        "Bong Joon-ho tür sınırlarını tanımaz; komedi, gerilim ve toplum eleştirisi aynı pota eritiyor.",
        "Bong'un sınıf bilinci sinemaya sinmiş; hikâye eğlendirirken alttan alta bir şey diyor.",
    ],
    "park chan-wook": [
        "Park Chan-wook'un estetize edilmiş şiddeti rahatsız eder ama gözünü alamazsın.",
        "Park Chan-wook intikamı bir operaya çevirir; güzellik ve acımasızlık yan yana.",
    ],
    "denis": [
        "Denis Villeneuve büyük ölçekli bilim kurguyu felsefi bir derinlikle harmanlıyor.",
    ],
    "coen": [
        "Coen Kardeşler'in kara mizahı burada da iş başında; absürt ve acımasız ama komik.",
        "Coen'lerin diyalogları kulağa yapışır; her replik hem gülümsetir hem düşündürür.",
    ],
    "refn": [
        "Refn'in neon estetiği ve minimal diyalogları burada da hipnotik bir atmosfer yaratıyor.",
    ],
    "malick": [
        "Malick'in şiirsel görsel dili burada da doğayla insanı iç içe geçiriyor.",
    ],
    "kieslowski": [
        "Kieślowski'nin ahlaki ikilemleri burada da izleyiciyi rahatsız edecek kadar samimi.",
    ],
    "fellini": [
        "Fellini'nin karnaval estetiği burada da gerçekle düşü birbirine karıştırıyor.",
    ],
    "wenders": [
        "Wenders yalnızlığı ve yol hikâyelerini kimsenin yapamadığı kadar güzel anlatır.",
    ],
}

# ── Ödül katmanı: awards string'inden anahtar kelime yakala → kısa cümle ──
_AWARD_PATTERNS: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r"Won \d+ Oscar|Academy Award", re.I), [
        "Oscar'lı bir yapım; Akademi'nin vitrinine girmiş olması tesadüf değil.",
        "Oscar kazanmış bir film; o heykelin arkasında gerçek bir zanaat var.",
        "Akademi Ödülü sahibi; eleştirmenlerin değil, endüstrinin de onayını almış.",
    ]),
    (re.compile(r"Palme d.Or|Cannes|palme", re.I), [
        "Cannes'ın kapılarından geçmiş bir film; festival sinemasının rafında yeri var.",
        "Cannes vitrini görmüş; sanat sinemasının seçkin kulübünden.",
    ]),
    (re.compile(r"Golden Bear|Berlin", re.I), [
        "Berlin'den ödülle dönmüş; Avrupa sinemasının nabzını tutan bir yapım.",
    ]),
    (re.compile(r"Golden Lion|Venice|Venezia", re.I), [
        "Venedik'ten ödülle çıkmış; dünyanın en eski festivalinin onayı hafife alınmaz.",
    ]),
    (re.compile(r"Alt[ıi]n Portakal|Antalya", re.I), [
        "Altın Portakal sahibi; Türk sinemasının kendi terazisinde ağırlığını koymuş.",
        "Antalya'dan ödülle dönmüş; yerli sinemanın vitrinine hak ederek girmiş.",
    ]),
    (re.compile(r"BAFTA", re.I), [
        "BAFTA ödüllü; İngiliz eleştirmenlerin beğenisini kazanmış bir yapım.",
    ]),
    (re.compile(r"Nominated for \d+ Oscar|Oscar nomin", re.I), [
        "Oscar adayı olmuş; yarışa girmeyi hak etmiş demek zaten bir şey.",
        "Akademi'nin radarına girmiş; adaylığın kendisi bile bir kalite işareti.",
    ]),
    (re.compile(r"Golden Globe", re.I), [
        "Altın Küre'nin radarında; Hollywood'un prestij liginde adı geçiyor.",
    ]),
]

# ── Türk sineması bağlam cümleleri: Türk filmi algılandığında eklenir ──
_TURKISH_DIRECTORS = {
    "ceylan", "demirkubuz", "turgul", "akin", "özpetek", "kaplanoglu",
    "erdem", "ustaoğlu", "kaplanoğlu", "bilge", "sorak", "erdoğan",
    "çelik", "şerif gören", "güney", "ağaoğlu", "tabak", "alper",
    "irmak", "tuna", "yılmaz", "kızıltan", "zaim", "karabey",
}

_TURKISH_CONTEXT = [
    "Türk sinemasının bu damarını tanıyanlar için tanıdık ama taze bir ses.",
    "Yerli sinemanın kendi hikâyesini anlatma cesaretini burada bir kez daha görüyorsun.",
    "Anadolu'nun ışığı ve sessizliği perdeye taşınmış; bu toprakların hikâyesi.",
    "Türk sinemasının son dönem olgunlaşmasının güzel bir örneği.",
    "Yerel dokusu güçlü; evrensel bir hikâyeyi kendi toprağından anlatıyor.",
    "Türkiye'den çıkan bu sesin uluslararası festivallerde yer bulması boşuna değil.",
]

# ── Kapanış: PUAN KADEMESİNE göre öneri gücü ──
_CLOSE_HIGH = [
    "Kısacası: fırsatın olduğunda sakın kaçırma.", "Bir akşamını gönül rahatlığıyla buna ayır.",
    "Listene almakta bir an bile tereddüt etme.", "Görülmesi gerekenlerden; geç kalma.",
    "Gönül rahatlığıyla öneririm.", "Hak ettiği ilgiyi esirgeme.",
]
_CLOSE_MID = [
    "Doğru ruh halinde keyifli bir tercih olur.", "Beklentini ayarlarsan memnun kalırsın.",
    "Canın hafif bir şey çekerse iyi gider.", "Bir akşamı rahatça kurtaracak kıvamda.",
    "Acelen yoksa listende sırasını bekleyebilir.", "Keyfine kalmış; fena bir seçim değil.",
]
_CLOSE_LOW = [
    "İzleyeceksen beklentini baştan düşük tut.", "Boş bir akşamlık; fazlası değil.",
    "Türün hastası değilsen sıraya koymana gerek yok.",
    "Meraktan açacaksan aç, ama başyapıt arama.",
    "Çok şey bekleme ki hayal kırıklığı yaşamayasın.", "Acele etme; sırada daha iyileri var.",
]
_CLOSE_UNKNOWN = [
    "Keşfetmeyi seviyorsan bir şans tanıyabilirsin.", "Riski sevenler için ilginç bir kumar.",
    "Açarsan, ne bulduğunu not etmeyi unutma.", "Cesaretine güveniyorsan bir dene.",
    "Maceracı bir ruhsan kapısını çal.",
]

_VERDICTS = {"high": _VERDICT_HIGH, "mid": _VERDICT_MID, "low": _VERDICT_LOW, "unknown": _VERDICT_UNKNOWN}
_TEXTURES = {"high": _TEXTURE_HIGH, "mid": _TEXTURE_MID, "low": _TEXTURE_LOW, "unknown": _TEXTURE_UNKNOWN}
_CLOSINGS = {"high": _CLOSE_HIGH, "mid": _CLOSE_MID, "low": _CLOSE_LOW, "unknown": _CLOSE_UNKNOWN}


def _primary_genre(details: dict) -> str:
    genre_ids = details.get("genre_ids") or []
    if genre_ids:
        return _GENRE_NAMES.get(genre_ids[0], "sinema")
    names = details.get("genres") or []
    return names[0] if names else "sinema"


def _best_rating_value(details: dict, ratings: dict):
    raw = (ratings or {}).get("imdb_rating")
    try:
        n = float(raw)
        if n > 0:
            return n
    except (TypeError, ValueError):
        pass
    try:
        v = float(details.get("vote_average"))
        if v > 0:
            return v
    except (TypeError, ValueError):
        pass
    return None


def _tier(rating):
    if rating is None:
        return "unknown"
    if rating >= 7.5:
        return "high"
    if rating >= 6.0:
        return "mid"
    return "low"


def _idx(seed_key: str, slot: str, n: int) -> int:
    """Slot başına BAĞIMSIZ, süreçler arası KALICI indeks (md5 tabanlı)."""
    h = hashlib.md5(f"{seed_key}|{slot}".encode("utf-8")).hexdigest()
    return int(h, 16) % n


def _match_known_director(director: str) -> str | None:
    """Yönetmen adını _KNOWN_DIRECTORS'ta ara (soyadı veya tam ad eşleşmesi)."""
    if not director:
        return None
    low = director.lower()
    for key in _KNOWN_DIRECTORS:
        if key in low:
            return key
    return None


def _detect_turkish(director: str, title: str) -> bool:
    """Basit sezgisel: Türk yönetmen soyadı veya Türkçe karakter yoğunluğu."""
    low_dir = (director or "").lower()
    for surname in _TURKISH_DIRECTORS:
        if surname in low_dir:
            return True
    turkish_chars = sum(1 for c in title if c in "çğıöşüÇĞİÖŞÜ")
    return turkish_chars >= 2


def _pick_award_line(awards_str: str, seed_key: str) -> str | None:
    """Awards string'inden en prestijli ödülü yakala, cümle döndür."""
    if not awards_str or awards_str == "N/A":
        return None
    for pattern, lines in _AWARD_PATTERNS:
        if pattern.search(awards_str):
            return lines[_idx(seed_key, "award", len(lines))]
    return None


def generate_note(details: dict, ratings: dict = None, mood_id: str = None) -> str:
    """Sıfır-maliyet, deterministik, puana-duyarlı ama PUANI GÖSTERMEYEN Üstad notu.

    Başına "Üstadın Notu:" öneki KOYMAZ (frontend zaten kırpıyor)."""
    details = details or {}
    ratings = ratings or {}

    title = (details.get("title") or "Bu film").strip()
    genre = _primary_genre(details)
    year = (details.get("release_date") or "")[:4] or "günümüzün"
    director = (ratings.get("director") or "").split(",")[0].strip()
    tier = _tier(_best_rating_value(details, ratings))

    seed_key = str(details.get("id") or details.get("tmdb_id") or title)
    fmt = {"title": title, "genre": genre, "year": year}

    opening = _OPENINGS[_idx(seed_key, "open", len(_OPENINGS))].format(**fmt)
    verdict = _VERDICTS[tier][_idx(seed_key, "verdict", len(_VERDICTS[tier]))].format(**fmt)

    # Üçüncü cümle: ünlü yönetmen → kişiye özel, yoksa genel zanaat / doku.
    known_key = _match_known_director(director)
    if known_key:
        pool = _KNOWN_DIRECTORS[known_key]
        middle = pool[_idx(seed_key, "craft", len(pool))]
    elif director:
        middle = _CRAFT[_idx(seed_key, "craft", len(_CRAFT))].format(director=director)
    else:
        middle = _TEXTURES[tier][_idx(seed_key, "texture", len(_TEXTURES[tier]))].format(**fmt)

    # Ödül katmanı: yalnız tanınmış ödülse eklenir.
    award_line = _pick_award_line(ratings.get("awards"), seed_key)

    # Türk sineması bağlamı: yönetmen veya başlık Türk ise, tier high/mid ise.
    turkish_line = None
    if tier in ("high", "mid") and _detect_turkish(director, title):
        turkish_line = _TURKISH_CONTEXT[_idx(seed_key, "turkish", len(_TURKISH_CONTEXT))]

    closing = _CLOSINGS[tier][_idx(seed_key, "close", len(_CLOSINGS[tier]))]
    if tier in ("high", "mid"):
        reason = _MOOD_CLOSINGS.get(mood_id)
        if reason:
            closing = f"{closing} {reason}"

    parts = [opening, verdict, middle, award_line, turkish_line, closing]
    return " ".join(p for p in parts if p).strip()
