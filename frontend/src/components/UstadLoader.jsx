import { useState, useEffect, useRef } from 'react';
import LottieAnimation from './LottieAnimation';

const texts = [
  "Üstad perdedeki yerini alıyor...",
  "Arşiv odasının kapıları aralanıyor...",
  "Sinemood senin için en doğru kareleri süzüyor...",
  "Işıklar loşlaştırılıyor, sinematik hafıza taranıyor...",
  "Biten bir kahvenin ardından, en iyi felsefi diyaloglar seçiliyor...",
  "Kadrajın derinliklerinde kaybolunuyor...",
  "Perde arkası raflar karıştırılıyor...",
  "Sinema tarihinin tozlu sayfaları çevriliyor..."
];

export default function UstadLoader({ duration = 1500, onComplete }) {
  const [loadingText, setLoadingText] = useState(texts[0]);
  const [visible, setVisible] = useState(true);
  const doneRef = useRef(false);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % texts.length;
      setLoadingText(texts[index]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setVisible(false);
      if (onComplete) onComplete();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[300px] w-full transition-opacity duration-500 ease-in-out ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="relative mb-6">
        <LottieAnimation
          path="/lottie/coffee-cup.json"
          className="w-28 h-28"
          speed={1.2}
        />
      </div>
      <p className="text-md font-medium text-zinc-300 tracking-wide text-center max-w-md transition-all duration-500 ease-in-out">
        {loadingText}
      </p>
    </div>
  );
}
