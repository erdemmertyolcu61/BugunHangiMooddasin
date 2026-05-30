import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Link2 } from 'lucide-react';
import { shareToWhatsApp, shareToTelegram, shareToTwitter, copyToClipboard } from '../utils/shareUtils';
import { track, EVENTS } from '../utils/analytics';

/**
 * WhatsApp / Telegram / X / Copy link share buttons.
 *
 * Props:
 *  - url: string — share URL
 *  - text: string — share text
 *  - className: string — wrapper classes
 *  - compact: boolean — smaller variant
 */
export default function ShareButtons({ url = '', text = '', className = '', compact = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const content = url ? `${text} ${url}`.trim() : text;
    await copyToClipboard(content || url);
    track(EVENTS.SHARE_CLICK, { network: 'copy' });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const btnBase = compact
    ? 'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200'
    : 'w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200';

  const iconSize = compact ? 15 : 17;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* WhatsApp */}
      <button
        onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'whatsapp' }); shareToWhatsApp(text, url); }}
        className={`${btnBase} bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/20 hover:border-[#25D366]/40 text-[#25D366] hover:scale-110`}
        title="WhatsApp"
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </button>

      {/* Telegram */}
      <button
        onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'telegram' }); shareToTelegram(text, url); }}
        className={`${btnBase} bg-[#0088cc]/15 hover:bg-[#0088cc]/25 border border-[#0088cc]/20 hover:border-[#0088cc]/40 text-[#0088cc] hover:scale-110`}
        title="Telegram"
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </button>

      {/* X / Twitter */}
      <button
        onClick={() => { track(EVENTS.SHARE_CLICK, { network: 'twitter' }); shareToTwitter(text, url); }}
        className={`${btnBase} bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/30 text-white/80 hover:text-white hover:scale-110`}
        title="X (Twitter)"
      >
        <svg width={iconSize - 2} height={iconSize - 2} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </button>

      {/* Copy link */}
      <button
        onClick={handleCopy}
        className={`${btnBase} ${copied
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
          : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/50 hover:text-white/80'
        } hover:scale-110`}
        title={copied ? 'Kopyalandı!' : 'Linki Kopyala'}
      >
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Check size={iconSize - 2} />
            </motion.div>
          ) : (
            <motion.div key="link" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Link2 size={iconSize - 2} />
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
