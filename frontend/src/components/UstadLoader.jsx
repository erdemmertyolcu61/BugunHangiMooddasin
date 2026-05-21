import { useState, useEffect } from 'react';

const texts = [
  "Üstad perdedeki yerini alıyor...",
  "Arşiv odasının kapıları aralanıyor...",
  "Sinemood senin için en doğru kareleri süzüyor...",
  "Işıklar loşlaştırılıyor, sinematik hafıza taranıyor...",
  "Biten bir kahvenin ardından, en iyi felsefi diyaloglar seçiliyor..."
];

export default function UstadLoader() {
  const [loadingText, setLoadingText] = useState(texts[0]);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % texts.length;
      setLoadingText(texts[index]);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] w-full">
      <div className="relative mb-6 animate-pulse">
        <img
          src="/sinemod-mark.png"
          alt="Sinemood"
          className="h-16 w-auto object-contain rounded-xl"
          style={{ filter: 'drop-shadow(0 0 15px rgba(212,175,55,0.6))' }}
        />
      </div>
      <p className="text-md font-medium text-zinc-300 tracking-wide text-center max-w-md transition-all duration-500 ease-in-out">
        {loadingText}
      </p>
    </div>
  );
}
