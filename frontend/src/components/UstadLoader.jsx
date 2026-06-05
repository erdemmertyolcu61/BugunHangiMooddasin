import { useState, useEffect } from 'react';
import LottieAnimation from './LottieAnimation';

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
      <div className="relative mb-6">
        <LottieAnimation
          path="/lottie/coffee-cup.json"
          className="w-28 h-28"
          speed={1}
        />
      </div>
      <p className="text-md font-medium text-zinc-300 tracking-wide text-center max-w-md transition-all duration-500 ease-in-out">
        {loadingText}
      </p>
    </div>
  );
}
