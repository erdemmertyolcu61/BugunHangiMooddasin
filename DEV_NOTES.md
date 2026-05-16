# Geliştirici Notları & Sorun Giderme

## Port 8001 Çakışması (Windows)

Eğer `python start.py` çalıştırdığınızda "8001 portu şu an kullanımda" hatası alıyorsanız, aşağıdaki adımları izleyin.

### 1. Portu Kullanan Uygulamayı Bulun ve Kapatın (PowerShell)

```powershell
Get-NetTCPConnection -LocalPort 8001 | Stop-Process -Id {$_.OwningProcess} -Force
```

### 2. Alternatif (Manuel PID ile)

```powershell
netstat -ano | findstr :8001
```
Çıkan satırın en sonundaki sayıyı (PID) kopyalayın ve şuraya yazın:
```powershell
taskkill /PID <PID_NUMARASI> /F
```

## Backend Servislerini Test Etme

### Health Check (Sağlık Kontrolü)
```powershell
curl.exe http://127.0.0.1:8001/health
```
**Beklenen Cevap:** `{"status":"ok", ...}`

### Audio Debug (Ses Dosyaları)
```powershell
curl.exe http://127.0.0.1:8001/api/audio/debug
```

### Mood Repository (Film Seçkisi)
```powershell
curl.exe http://127.0.0.1:8001/api/repository/movies/battaniye
```

## Frontend Yapılandırması

API Base URL ayarı `.env` dosyası üzerinden veya varsayılan olarak şu adresten yönetilir:
`VITE_API_BASE_URL=http://127.0.0.1:8001`
