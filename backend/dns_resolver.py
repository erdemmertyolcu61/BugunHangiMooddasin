"""
DNS-over-HTTPS Resolver — Türk ISP DNS zehirlemesini aşmak için.
Google DoH (dns.google) üzerinden gerçek IP adreslerini çözer ve
socket.getaddrinfo'yu yamalayarak httpx/aiohttp'nin doğru sunucuya
bağlanmasını sağlar. SSL SNI otomatik olarak çalışır.
"""
import socket
import time
import urllib.request
import json

_original_getaddrinfo = socket.getaddrinfo
_resolved_ips: dict[str, str] = {}
_resolve_timestamps: dict[str, float] = {}
_TTL = 300  # 5 dakika cache

DOMAINS_TO_RESOLVE = [
    "api.themoviedb.org",
    "image.tmdb.org",
]

def _patched_getaddrinfo(host, port, *args, **kwargs):
    """Çözümlenmiş domainler için gerçek IP'ye yönlendir ve analiz için logla."""
    h = host if isinstance(host, str) else host.decode()
    try:
        with open("dns_debug.log", "a", encoding="utf-8") as f:
            f.write(f"[{time.time()}] Resolve requested for: {h}\n")
    except Exception:
        pass

    if h in _resolved_ips:
        now = time.time()
        if now - _resolve_timestamps.get(h, 0) < _TTL:
            res = _original_getaddrinfo(_resolved_ips[h], port, *args, **kwargs)
            try:
                with open("dns_debug.log", "a", encoding="utf-8") as f:
                    f.write(f"[{time.time()}] Resolved {h} -> {res}\n")
            except Exception:
                pass
            return res
    return _original_getaddrinfo(host, port, *args, **kwargs)


def _resolve_via_doh_sync(hostname: str) -> str | None:
    """Google DNS-over-HTTPS ile gerçek IP adresini senkron olarak çöz."""
    try:
        url = f"https://dns.google/resolve?name={hostname}&type=A"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10.0) as response:
            data = json.loads(response.read().decode())
            answers = data.get("Answer", [])

            # Önce doğrudan A kaydı ara
            for answer in answers:
                if answer.get("type") == 1:  # A record
                    return answer["data"]

            # A kaydı yoksa CNAME'i takip et ve hedefi de kaydet
            for answer in answers:
                if answer.get("type") == 5:  # CNAME record
                    cname_target = answer["data"].rstrip(".")
                    print(f"[DNS] CNAME takip: {hostname} -> {cname_target}")
                    ip = _resolve_via_doh_sync(cname_target)
                    if ip:
                        _resolved_ips[cname_target] = ip
                        _resolve_timestamps[cname_target] = time.time()
                        print(f"[DNS] CNAME hedefi eklendi: {cname_target} -> {ip}")
                    return ip
    except Exception as e:
        print(f"[DNS] DoH çözümleme hatası ({hostname}): {e}")
    return None

def apply_dns_patch_sync():
    """Tüm hedef domainleri senkron olarak çözümle ve yamanın import anında uygulanmasını sağla."""
    patched = False
    for domain in DOMAINS_TO_RESOLVE:
        ip = _resolve_via_doh_sync(domain)
        if ip:
            _resolved_ips[domain] = ip
            _resolve_timestamps[domain] = time.time()
            print(f"[DNS] Bypass aktif: {domain} -> {ip}")
            patched = True
        else:
            print(f"[DNS] UYARI: {domain} çözümlenemedi, varsayılan DNS kullanılacak")

    if patched:
        socket.getaddrinfo = _patched_getaddrinfo
        print("[DNS] socket.getaddrinfo yaması uygulandı")

# Yamayı modül yüklendiği an hemen (senkron) uygula!
apply_dns_patch_sync()

# Geriye dönük uyumluluk (main.py lifespan içinde hata vermemesi için boş async fonksiyon)
async def setup_dns_bypass():
    pass

async def refresh_dns():
    """Cache süresi dolan kayıtları yenile."""
    now = time.time()
    for domain in DOMAINS_TO_RESOLVE:
        if now - _resolve_timestamps.get(domain, 0) >= _TTL:
            ip = _resolve_via_doh_sync(domain)
            if ip:
                _resolved_ips[domain] = ip
                _resolve_timestamps[domain] = now
                print(f"[DNS] Yenilendi: {domain} -> {ip}")
