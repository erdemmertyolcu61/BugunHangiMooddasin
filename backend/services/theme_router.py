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
