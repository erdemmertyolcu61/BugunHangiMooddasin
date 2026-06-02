"""
Theme Router — "Kafan mı Karışık" için tematik/somut konu sorgularını
TMDB keyword + genre aramasına yönlendirir.

Kullanıcı "yaz temalı", "deniz", "yılbaşı filmi", "uzayda geçen", "futbol",
"gerçek hikaye" gibi yazınca; TR ifadeyi İngilizce TMDB keyword terim(ler)ine
eşler. Terimler çalışma anında TMDB /search/keyword ile ID'ye çevrilir (sabit ID
gömmeyiz → daha güvenilir), sonra /discover/movie ile gerçekten o temaya ait,
kaliteli filmler çekilir.
"""
import re

_TR_FOLD = str.maketrans("çğıöşü", "cgiosu")


def _fold(text: str) -> str:
    t = (text or "").strip().lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.translate(_TR_FOLD)


# Her tema: tetikleyici TR ifadeler (folded) + İngilizce TMDB keyword terimleri
# + opsiyonel genre_ids + kullanıcıya gösterilmeyecek label + Üstad satırı.
# 'triggers' folded (aksansız) yazılır. En uzun trigger önce eşleşsin diye
# eşleştirici uzunluğa göre sıralar.
THEMES = [
    # ── Mevsim ──
    {"key": "yaz", "triggers": ["yaz temali", "yaz filmi", "yaz "], "terms": ["summer"], "genres": [], "label": "Yaz temalı filmler", "ustad": "Güneşin teni yaktığı, o uzun yaz akşamlarının filmleri — işte sana bir tutam yaz."},
    {"key": "kis", "triggers": ["kis temali", "kis filmi", "karli", "kar yagisi"], "terms": ["winter", "snow"], "genres": [], "label": "Kış temalı filmler", "ustad": "Soğuk dışarıda kalsın; bu filmler kışı bir battaniye gibi sarıyor."},
    {"key": "noel", "triggers": ["yilbasi", "noel", "yeni yil filmi"], "terms": ["christmas"], "genres": [], "label": "Yılbaşı/Noel filmleri", "ustad": "Çam kokusu, ışıklar ve sıcacık bir nostalji — yılbaşının ruhu."},
    # ── Mekan ──
    {"key": "deniz", "triggers": ["deniz", "okyanus", "sahil", "ada"], "terms": ["ocean", "sea", "island"], "genres": [], "label": "Deniz/okyanus temalı filmler", "ustad": "Tuzlu rüzgâr ve uçsuz bucaksız mavi — denizin çağrısına kulak ver."},
    {"key": "uzay", "triggers": ["uzay", "uzayda", "gezegen", "galaksi"], "terms": ["space", "outer space"], "genres": [878], "label": "Uzayda geçen filmler", "ustad": "Yıldızların arasında kaybol — Üstad seni boşluğa uğurluyor."},
    {"key": "okul", "triggers": ["okul", "lise", "universite", "ogrenci"], "terms": ["high school", "school"], "genres": [], "label": "Okul/gençlik temalı filmler", "ustad": "Sıraların, ilk aşkların ve büyüme sancılarının filmleri."},
    {"key": "hapishane", "triggers": ["hapishane", "hapis", "mahkum", "cezaevi"], "terms": ["prison"], "genres": [], "label": "Hapishane filmleri", "ustad": "Demir parmaklıklar ardında özgürlüğün ne demek olduğunu hatırlatanlar."},
    {"key": "col", "triggers": ["col ", "cole ", "colde"], "terms": ["desert"], "genres": [], "label": "Çöl temalı filmler", "ustad": "Sonsuz kum, kavurucu güneş ve insanın kendiyle hesaplaşması."},
    {"key": "tasra", "triggers": ["tasra", "kasaba", "anadolu", "koy "], "terms": ["small town", "village"], "genres": [18], "label": "Taşra/kasaba temalı filmler", "ustad": "Yavaş akan, sessiz ama derin — taşranın kasveti ve şiiri."},
    # ── Olay / konu ──
    {"key": "savas", "triggers": ["savas", "cephe", "asker"], "terms": ["war"], "genres": [10752], "label": "Savaş filmleri", "ustad": "Cephede yitenler ve insanlığın en ağır sınavı — sarsıcı yapımlar."},
    {"key": "salgin", "triggers": ["salgin", "pandemi", "virus", "veba"], "terms": ["pandemic", "virus", "epidemic"], "genres": [], "label": "Salgın temalı filmler", "ustad": "Görünmez bir düşman ve dağılan dünya — tüyler ürperten bir gerçeklik."},
    {"key": "zaman", "triggers": ["zaman yolculugu", "zamanda yolculuk", "zaman makinesi"], "terms": ["time travel"], "genres": [878], "label": "Zaman yolculuğu filmleri", "ustad": "Geçmiş, gelecek ve aradaki paradokslar — zihnini bükmeye hazır ol."},
    {"key": "soygun", "triggers": ["soygun", "soygunu", "vurgun"], "terms": ["heist"], "genres": [80, 53], "label": "Soygun filmleri", "ustad": "Kusursuz plan, son saniye sürprizi — adrenalin dolu vurgunlar."},
    {"key": "mahkeme", "triggers": ["mahkeme", "dava", "avukat", "durusma"], "terms": ["courtroom", "trial"], "genres": [18], "label": "Mahkeme/hukuk filmleri", "ustad": "Adaletin terazisinde gerilim — her replik bir kanıt."},
    {"key": "hayatta_kalma", "triggers": ["hayatta kalma", "hayatta kal", "felaket", "afet"], "terms": ["survival", "disaster"], "genres": [], "label": "Hayatta kalma/felaket filmleri", "ustad": "İnsanın en çıplak hâli: hayatta kalma içgüdüsü."},
    {"key": "dugun", "triggers": ["dugun", "evlilik"], "terms": ["wedding", "marriage"], "genres": [10749, 35], "label": "Düğün/evlilik temalı filmler", "ustad": "Vaatler, kaoslar ve kalp atışları — evliliğin perdedeki hâli."},
    # ── Kişi / varlık ──
    {"key": "zombi", "triggers": ["zombi", "zombie"], "terms": ["zombie"], "genres": [27], "label": "Zombi filmleri", "ustad": "Yürüyen ölüler ve insanlığın son kalesi — nefes kesen bir kovalamaca."},
    {"key": "vampir", "triggers": ["vampir", "vampire"], "terms": ["vampire"], "genres": [27, 14], "label": "Vampir filmleri", "ustad": "Karanlığın asil avcıları — kan, tutku ve ölümsüzlük."},
    {"key": "superkahraman", "triggers": ["super kahraman", "superkahraman", "kahraman filmi"], "terms": ["superhero"], "genres": [28, 878], "label": "Süper kahraman filmleri", "ustad": "Pelerinler, güçler ve şehri kurtarma yarışı."},
    {"key": "serikatil", "triggers": ["seri katil", "katil temali"], "terms": ["serial killer"], "genres": [53, 80], "label": "Seri katil filmleri", "ustad": "Karanlığın en soğuk yüzü — zihnine işleyecek gerilimler."},
    # ── Uğraş / sanat / spor ──
    {"key": "futbol", "triggers": ["futbol", "mac ", "taraftar"], "terms": ["football", "soccer"], "genres": [], "label": "Futbol/spor temalı filmler", "ustad": "Sahanın tutkusu, zaferi ve hüsranı — tribün kadar coşkulu."},
    {"key": "spor", "triggers": ["spor filmi", "boks", "basketbol"], "terms": ["sport", "boxing"], "genres": [], "label": "Spor temalı filmler", "ustad": "Ter, azim ve son düdükteki zafer — ilham veren mücadeleler."},
    {"key": "muzik", "triggers": ["muzik", "muzisyen", "sarkici", "grup filmi", "rock"], "terms": ["music", "musician"], "genres": [10402], "label": "Müzik temalı filmler", "ustad": "Bir melodinin etrafında dönen hayatlar — ritmi hisset."},
    {"key": "dans", "triggers": ["dans", "bale", "dansci"], "terms": ["dance", "ballet"], "genres": [10402], "label": "Dans temalı filmler", "ustad": "Bedenin diliyle anlatılan tutku — her adım bir cümle."},
    {"key": "yemek", "triggers": ["yemek", "asci", "mutfak", "gurme", "restoran"], "terms": ["cooking", "chef", "food"], "genres": [], "label": "Yemek/mutfak temalı filmler", "ustad": "Tabağa dökülen sanat — iştahını da ruhunu da doyuran filmler."},
    {"key": "ressam", "triggers": ["ressam", "sanatci filmi", "resim sanat"], "terms": ["painter", "artist"], "genres": [18], "label": "Sanatçı/ressam temalı filmler", "ustad": "Tuvalin ardındaki tutku ve çılgınlık."},
    {"key": "satranc", "triggers": ["satranc"], "terms": ["chess"], "genres": [], "label": "Satranç temalı filmler", "ustad": "64 karede dahilik ve takıntı — zihinsel bir düello."},
    # ── Tarz / anlatım ──
    {"key": "gercek_hikaye", "triggers": ["gercek hikaye", "gercek olay", "yasanmis"], "terms": ["based on a true story", "biography"], "genres": [], "label": "Gerçek hikayeden uyarlanan filmler", "ustad": "Gerçeğin kurgudan tuhaf olduğu anlar — yaşanmışın gücü."},
    {"key": "yol", "triggers": ["yol filmi", "road trip", "yolculuk filmi"], "terms": ["road trip", "road movie"], "genres": [12], "label": "Yol filmleri", "ustad": "Asfaltta kendini bulma hikâyeleri — varış değil, yolculuk."},
    {"key": "kara_komedi", "triggers": ["kara komedi", "kara mizah"], "terms": ["black comedy", "dark comedy"], "genres": [35], "label": "Kara komedi filmleri", "ustad": "Acıyla gülümseten, sırıtırken düşündüren bir keskinlik."},
    {"key": "distopya", "triggers": ["distopya", "distopik"], "terms": ["dystopia"], "genres": [878], "label": "Distopya filmleri", "ustad": "Çürümüş bir gelecek ve insanlığın çatlakları — ürkütücü ve düşündürücü."},
    # ── Karakter yayları ──
    {"key": "delirme", "triggers": ["yavas yavas delir", "delirdigi", "akil sagligini yitir", "cilginliga suruklen", "delirme sureci"], "terms": ["insanity", "mental illness", "psychological"], "genres": [53, 18], "label": "Çöküş/delilik temalı filmler", "ustad": "Aklın ipini santim santim bırakışı — izlerken sen de ürperirsin evlat."},
    {"key": "yukselis", "triggers": ["yukselisini anlat", "zirveye cikis", "sifirdan zirveye", "dahinin yukselisi", "guce ulasma", "basari hikayesi anlat"], "terms": ["rise to power", "self made man", "ambition"], "genres": [18], "label": "Yükseliş/zirveye çıkış hikayeleri", "ustad": "Tozun içinden doğup zirveye yürüyenler — hırsın destanı."},
    {"key": "dusus", "triggers": ["dususunu anlat", "cokusu anlat", "zirveden dibe", "her seyini kaybeden", "yikim hikayesi"], "terms": ["downfall", "self destruction", "addiction"], "genres": [18], "label": "Düşüş/çöküş hikayeleri", "ustad": "Zirvedekinin dibe vuruşu — en acı düşüş, en yüksekten olandır."},
    {"key": "suskun_karizma", "triggers": ["az konusan", "sessiz ama karizmatik", "suskun kahraman", "konusmayan karakter", "sakin karizmatik", "lakonik karakter"], "terms": ["man of few words", "stoic", "antihero"], "genres": [80, 53], "label": "Sessiz, az konuşan karizmatik karakterler", "ustad": "Az söyleyip çok şey anlatan adamlar — sükûtun karizması."},
    {"key": "deha", "triggers": ["dahi bir adam", "dahi bir kadin", "dahi karakter", "ustun zeka", "deha hikayesi", "bir dahinin"], "terms": ["genius", "prodigy", "intelligence"], "genres": [18], "label": "Dahi/üstün zeka temalı filmler", "ustad": "Zihni herkesten bir adım önde olanın yalnızlığı ve ateşi."},
    {"key": "intikam_yayi", "triggers": ["intikam pesinde", "intikamini al", "oc alma hikayesi", "intikam yolculugu"], "terms": ["revenge", "vengeance"], "genres": [28, 53], "label": "İntikam temalı filmler", "ustad": "Soğukkanlı bir hesaplaşma — intikam en iyi, sabırla servis edilir."},
    {"key": "kimlik_arayisi", "triggers": ["kendini arayan", "kimlik arayisi", "kendini bulma yolculugu", "kim oldugunu", "ic yolculuk"], "terms": ["identity", "self discovery", "coming of age"], "genres": [18], "label": "Kimlik/kendini arayış hikayeleri", "ustad": "İnsanın en uzun yolculuğu kendine olandır."},
    {"key": "kefaret", "triggers": ["gunahlarindan arin", "kefaret hikayesi", "vicdan hesaplasmasi", "pismanlik ve affedilme", "gecmisiyle yuzlesen"], "terms": ["redemption", "guilt", "atonement"], "genres": [18], "label": "Kefaret/vicdan temalı filmler", "ustad": "Geçmişin yüküyle yüzleşip arınmaya çalışanlar — ağır ama temizleyici."},
    {"key": "ikili_kisilik", "triggers": ["cift kisilik", "ikili kisilik", "bolunmus kimlik", "ic sesleriyle"], "terms": ["split personality", "dual identity", "doppelganger"], "genres": [53], "label": "Çift kişilik/bölünmüş kimlik filmleri", "ustad": "İçindeki ikinci ses sahneye çıktığında işler karışır."},
    # ── Anlatı kavramları ──
    {"key": "yapay_zeka", "triggers": ["yapay zeka", "yapay zekanin", "insan ve makine", "robot ve insan", "yapay zeka felsefi", "yapay zeka iliskisi"], "terms": ["artificial intelligence", "robot"], "genres": [878], "label": "Yapay zeka temalı filmler", "ustad": "Makinenin ruhu var mı? İnsanlığın aynaya bakışı."},
    {"key": "zaman_dongusu", "triggers": ["zaman dongusu", "zaman dongusunde", "ayni gunu tekrar", "zaman kapani", "donguye sikism", "ayni gun tekrarlan"], "terms": ["time loop"], "genres": [878, 53], "label": "Zaman döngüsü filmleri", "ustad": "Aynı günü tekrar tekrar yaşamak — ya kâbus ya da kurtuluş."},
    {"key": "paralel_evren", "triggers": ["paralel evren", "alternatif gerceklik", "coklu evren", "paralel dunyalar"], "terms": ["parallel universe", "alternate reality", "multiverse"], "genres": [878], "label": "Paralel evren temalı filmler", "ustad": "Bir tercih, bin evren — yol ayrımının sonsuz yankısı."},
    {"key": "hafiza_kaybi", "triggers": ["hafiza kaybi", "hafizasini kaybeden", "gecmisini hatirlamayan", "unutkanlik temali", "kim oldugunu hatirlamayan"], "terms": ["amnesia", "memory loss"], "genres": [53, 9648], "label": "Hafıza kaybı temalı filmler", "ustad": "Geçmişi silinmiş bir zihinde gerçeği aramak — kaygan bir zemin."},
    {"key": "ruya_zihin", "triggers": ["ruya icinde", "ruyalar uzerine", "bilincalti yolculuk", "zihne girme", "ruya gerceklik"], "terms": ["dream", "subconscious"], "genres": [878, 53], "label": "Rüya/bilinçaltı temalı filmler", "ustad": "Uyanık mıyız, uykuda mı — sınırın belirsizleştiği yer."},
    {"key": "gercek_mi", "triggers": ["gercek mi degil mi", "neyin gercek oldugu belirsiz", "akil oyunu film", "zihin bukulmesi", "kafa karistiran kurgu"], "terms": ["mindfuck", "twist ending"], "genres": [53, 9648], "label": "Zihin büken/gerçeklik sorgulatan filmler", "ustad": "Ayağının altındaki zemin kayar — neyin gerçek olduğundan emin olamazsın."},
    {"key": "kiyamet_sonrasi", "triggers": ["kiyamet sonrasi", "dunyanin sonu", "post apokaliptik", "medeniyetin cokusu", "yikilmis dunya"], "terms": ["post apocalyptic", "apocalypse"], "genres": [878, 28], "label": "Kıyamet sonrası filmler", "ustad": "Her şey bittikten sonra geriye kalan insanlık — küllerin arasında umut."},
    # ── Mekan / dinamik ──
    {"key": "tek_mekan", "triggers": ["tek mekanda gecen", "tek mekan", "klostrofobik", "kapali mekan gerilim", "tek odada gecen", "sinirli mekan"], "terms": ["single location", "claustrophobic"], "genres": [53], "label": "Tek mekan/klostrofobik filmler", "ustad": "Dört duvar, kaçış yok — daralan mekânın nefes kesen gerilimi."},
    {"key": "kasaba_dedektif", "triggers": ["kasabada gecen gizem", "kucuk kasaba gizemi", "tasra dedektiflik", "kasaba cinayeti", "kasabada dedektif"], "terms": ["small town", "detective"], "genres": [9648, 80], "label": "Küçük kasaba gizem/dedektiflik hikayeleri", "ustad": "Sessiz kasabanın altında kaynayan sırlar — her kapı bir şüpheli."},
    {"key": "yeralti_dunya", "triggers": ["yeralti dunyasi", "mafya hikayesi", "organize suc", "cete savaslari", "suc imparatorlugu"], "terms": ["organized crime", "mafia", "gangster"], "genres": [80, 18], "label": "Mafya/yeraltı dünyası filmleri", "ustad": "Karanlığın hiyerarşisi — sadakat ve ihanetin kanlı dansı."},
    {"key": "izole_mekan", "triggers": ["karli izole", "izole bir yerde", "ucra bir yer", "kar ortasinda mahsur", "izole mekanda"], "terms": ["isolation", "wilderness"], "genres": [53, 18], "label": "İzole/ücra mekan gerilimleri", "ustad": "Medeniyetten uzakta, beyaz bir sessizlikte yalnız kalmak."},
    {"key": "gemi_denizalti", "triggers": ["gemide gecen", "denizalti film", "okyanusta mahsur", "batan gemi"], "terms": ["submarine", "ship", "shipwreck"], "genres": [53, 12], "label": "Gemi/denizaltı temalı filmler", "ustad": "Suyun altında basınç artarken insan ruhu da sınanır."},
    # ── Para / iktidar / kurumlar ──
    {"key": "finans_hirs", "triggers": ["finans dunyasi", "borsa film", "para ve hirs", "wall street", "finansal hirs", "para hirsi uzerine"], "terms": ["stock market", "wall street", "greed"], "genres": [18, 80], "label": "Finans/borsa/hırs temalı filmler", "ustad": "Para kokan koridorlarda hırsın insanı nasıl yuttuğunu izle."},
    {"key": "ifsa_sistem", "triggers": ["sistemi ifsa eden", "ifsaci hikayesi", "buyuk komplo", "gercegi ortaya cikaran gazeteci"], "terms": ["whistleblower", "conspiracy", "investigative journalism"], "genres": [53, 18], "label": "İfşa/sistem sorgulayan filmler", "ustad": "Tek bir doğru sözün koca bir sistemi sarstığı anlar."},
    {"key": "siyaset_iktidar", "triggers": ["siyaset entrika", "iktidar oyunlari", "politik gerilim", "siyasi komplo", "guc mucadelesi politik"], "terms": ["politics", "political thriller", "corruption"], "genres": [18, 53], "label": "Siyaset/iktidar temalı filmler", "ustad": "Koltuğun arkasındaki gölge oyunları — iktidar kimseyi affetmez."},
    {"key": "kurumsal", "triggers": ["sirket ici", "kurumsal dunya", "ofis hayati", "is dunyasi hicvi", "patron calisan"], "terms": ["corporate", "workplace", "office"], "genres": [18, 35], "label": "Kurumsal/iş dünyası filmleri", "ustad": "Cam binaların içindeki sessiz savaşlar — kravatlı bir cangıl."},
    {"key": "bilim_etik", "triggers": ["bilim insani etik", "tehlikeli deney", "bilimsel kesfin bedeli", "etik sinir bilim", "kontrolden cikan deney"], "terms": ["scientist", "experiment gone wrong", "mad scientist"], "genres": [878, 53], "label": "Bilim/etik sınırı temalı filmler", "ustad": "İnsan tanrıcılık oynayınca laboratuvar bir trajediye dönüşür."},
    # ── Ton / atmosfer ──
    {"key": "yavas_gerilim", "triggers": ["minimalist gerilim", "sade ama gergin", "az diyalogla gerilim", "soguk atmosfer film"], "terms": ["neo noir", "slow burn"], "genres": [53, 80], "label": "Minimalist/yavaş yanan gerilimler", "ustad": "Ateş yavaş yanar ama içini en derinden ısıtır — sabırlı gerilim."},
    {"key": "buyume_acisi", "triggers": ["buyume sancisi", "ergenlik hikayesi", "yetiskinlige gecis", "genclik bunalimi", "buyurken kaybetmek"], "terms": ["coming of age", "adolescence"], "genres": [18], "label": "Büyüme sancısı/ergenlik hikayeleri", "ustad": "Çocukluğun bittiği o eşik — tatlı ve acı bir geçiş."},
    {"key": "yalnizlik", "triggers": ["yalnizlik uzerine", "yalniz bir adam", "modern yalnizlik", "yalniz kalan insan"], "terms": ["loneliness", "solitude"], "genres": [18], "label": "Yalnızlık temalı filmler", "ustad": "Kalabalığın ortasındaki o derin sessizlik — yalnızlığın portresi."},
    {"key": "varolus_sorgu", "triggers": ["varolussal sorgu", "hayatin anlami uzerine", "varolus felsefi", "yasamin anlamini sorgula", "felsefi varolus"], "terms": ["existentialism", "philosophy"], "genres": [18, 878], "label": "Varoluşsal/felsefi sorgulama filmleri", "ustad": "Niçin buradayız sorusunun perdedeki yankısı — derin ve sarsıcı."},
    {"key": "kara_kader", "triggers": ["kara talih", "kaderin oyunu", "trajik kader", "talihsizlik zinciri", "kacinilmaz son"], "terms": ["fate", "tragedy"], "genres": [18], "label": "Kader/trajedi temalı filmler", "ustad": "Kaçışı olmayan bir döngü — kaderin demir eli."},
    # ── İlişki yayları ──
    {"key": "imkansiz_ask", "triggers": ["imkansiz ask hikayesi", "yasak ask", "kavusamayan asiklar", "imkansiz iliski"], "terms": ["forbidden love", "tragic romance"], "genres": [10749, 18], "label": "İmkansız/yasak aşk hikayeleri", "ustad": "Kavuşamayanların hüznü — en derin aşk, eksik kalandır."},
    {"key": "aile_sirri", "triggers": ["aile sirri", "aile ici dram", "gizli aile gecmisi", "kardes catismasi", "miras kavgasi"], "terms": ["dysfunctional family", "family secret"], "genres": [18], "label": "Aile sırrı/aile içi dram filmleri", "ustad": "Aynı çatının altındaki en derin yaralar — kan bağının ağırlığı."},
    {"key": "dostluk", "triggers": ["dostluk hikayesi", "iki arkadasin hikayesi", "sadik dostluk", "beklenmedik dostluk"], "terms": ["friendship", "buddy"], "genres": [18, 35], "label": "Dostluk temalı filmler", "ustad": "Kan bağı olmadan kurulan en sağlam bağ — gerçek dostluk."},
    {"key": "mentor_cirak", "triggers": ["usta cirak", "mentor ve ogrenci", "ustasindan ogrenen", "yol gosteren usta"], "terms": ["mentor", "teacher and student"], "genres": [18], "label": "Usta-çırak/mentor temalı filmler", "ustad": "Bir ustanın gölgesinde yetişmek — bilgelik elden ele geçer."},
    # ── Ödül / Festival ──
    {"key": "oscar", "triggers": ["oscar odullu", "oscar kazanan", "oscar filmi", "akademi odulu"], "terms": ["academy award", "oscar"], "genres": [], "label": "Oscar ödüllü filmler", "ustad": "Sinema dünyasının en prestijli ödülüne layık görülmüş başyapıtlar."},
    {"key": "altin_palmiye", "triggers": ["altin palmiye", "cannes odullu", "cannes film festivali"], "terms": ["cannes", "palme d'or"], "genres": [], "label": "Altın Palmiye ödüllü filmler", "ustad": "Cannes'ın en büyük ödülü — sinemanın zirvesindeki seçkinler."},
    {"key": "berlin_film_festivali", "triggers": ["berlin film festivali", "altin ayi", "berlinale"], "terms": ["berlin international film festival", "golden bear"], "genres": [], "label": "Berlin Film Festivali ödüllü filmler", "ustad": "Berlinale'nin seçkisi — sanatsal sinemanın en cesur örnekleri."},
    {"key": "venedik", "triggers": ["venedik film festivali", "altin aslan"], "terms": ["venice film festival", "golden lion"], "genres": [], "label": "Venedik Film Festivali ödüllü filmler", "ustad": "Venedik'in altın aslanı — sinema sanatının en nadide parçaları."},
    {"key": "altin_kure", "triggers": ["altin kure", "golden globe"], "terms": ["golden globe"], "genres": [], "label": "Altın Küre ödüllü filmler", "ustad": "Hollywood'un en gözde ödüllerinden — kalite tescili."},
]

# En uzun/özgül trigger önce denensin (örn. "zaman yolculugu" > "yol filmi").
_THEME_TRIGGERS = sorted(
    [(t, theme) for theme in THEMES for t in theme["triggers"]],
    key=lambda x: -len(x[0]),
)


def match_theme(text: str):
    """Metinden tema yakala. Eşleşme yoksa None."""
    folded = _fold(text)
    if not folded:
        return None
    padded = f" {folded} "
    for trig, theme in _THEME_TRIGGERS:
        t = trig.strip()
        # kısa/genel tetikleyiciler için kelime-sınırı, uzunlar için substring
        if len(t) <= 4:
            if f" {t} " in padded:
                return theme
        elif t in folded:
            return theme
    return None
