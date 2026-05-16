"""
Film Connoisseur - Single Launcher
python start.py  ile backend (8002) + frontend (3005) tek komutta acilir.

Sorun giderme:
- "HATA: 8002 portu kullanimda"  ->  once eski process'i oldurun
- Backend acilmiyorsa: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8002
"""
import subprocess, sys, os, socket, time

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8002


def _p(text):
    try:
        print(text)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding, errors="replace").decode(sys.stdout.encoding)
        print(safe)


def check_env():
    env_path = os.path.join(ROOT_DIR, ".env")
    if not os.path.exists(env_path):
        _p("\n- .env bulunamadi! .env.example -> .env kopyalayip API anahtarlarini girin:\n")
        _p("   TMDB_API_KEY     -> https://www.themoviedb.org/settings/api")
        _p("   OMDB_API_KEY     -> https://www.omdbapi.com/apikey.aspx")
        _p("   ANTHROPIC_API_KEY -> https://console.anthropic.com/\n")
        sys.exit(1)


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def find_free_port(start=8002, max_try=10):
    for port in range(start, start + max_try):
        if not port_in_use(port):
            return port
    return None


def main():
    check_env()

    free_port = find_free_port(PORT, 5)
    if free_port is None:
        _p(f"\nHATA: 8002-8006 arasi tum portlar dolu! Once kapat:")
        _p(f"   PowerShell: Get-NetTCPConnection -LocalPort 8002 | Stop-Process -Id {{$_.OwningProcess}} -Force")
        _p(f"   CMD: netstat -ano | findstr :8002  then  taskkill /PID <PID> /F\n")
        sys.exit(1)

    actual_port = free_port
    if actual_port != PORT:
        _p(f"\nUYARI: {PORT} portu dolu, {actual_port} kullanilacak.\n")

    _p("========================================")
    _p("[Film Elestirmeni] Baslatiliyor...")
    _p("========================================")
    _p(f"  Backend  -> http://localhost:{actual_port}")
    _p(f"  Frontend -> http://localhost:3005")
    _p(f"  Kapatmak -> Ctrl+C")
    _p("========================================\n")

    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app",
         "--host", "0.0.0.0", "--port", str(actual_port)],
        cwd=ROOT_DIR,
    )

    frontend = subprocess.Popen(
        ["npm", "run", "dev"], cwd=os.path.join(ROOT_DIR, "frontend"), shell=True
    )

    time.sleep(3)
    if backend.poll() is not None:
        _p(f"\nHATA: Backend hemen kapandi! (exit code: {backend.returncode})")
        _p("Muhtemel sebep: Python bagimliliklari eksik veya kod hatasi.")
        _p("Ayri terminalde su komutu calistirip hatayi gormeyi dene:")
        _p(f"  python -m uvicorn backend.main:app --host 0.0.0.0 --port {actual_port}")
        sys.exit(1)

    _p(f"Backend basariyla basladi (PID: {backend.pid}).")
    _p("Tarayicida http://localhost:3005 adresini ac.\n")

    try:
        backend.wait()
        frontend.wait()
    except KeyboardInterrupt:
        _p("\nKapatiliyor...")
        backend.terminate()
        frontend.terminate()
        backend.wait()
        frontend.wait()
        _p("Kapandi.")


if __name__ == "__main__":
    main()
