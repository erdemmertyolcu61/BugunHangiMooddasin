import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOff = () => setOffline(true);
    const goOn = () => setOffline(false);
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => {
      window.removeEventListener('offline', goOff);
      window.removeEventListener('online', goOn);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 py-2 bg-amber/90 text-bg text-xs font-bold uppercase tracking-widest">
      <WifiOff size={14} />
      Çevrimdışısın — önbellekteki içerikler gösteriliyor
    </div>
  );
}
