import React from 'react';

const UstadinNotu = ({ noteText, movieName }) => {
  if (!noteText && !movieName) return null;

  const nameEmbedded = movieName && noteText?.includes(movieName);

  return (
    <div className="bg-[#161618] rounded-2xl p-6 md:p-8 border border-[#232326] shadow-lg">

      <p className="text-xs font-sans uppercase tracking-[0.2em] text-[#D4AF37] mb-5">
        🎬 Üstadın Notu
      </p>

      <p className="font-playfair italic leading-relaxed text-[#E5E5E5] text-base">
        &ldquo;{noteText}
        {movieName && !nameEmbedded && (
          <> Özellikle{' '}
            <span className="inline-block not-italic font-bold text-white bg-white/10 border border-white/20 rounded-md px-1.5 py-0.5">
              {movieName}
            </span>{' '}
            senin için bu gecenin anahtarı olacak...
          </>
        )}
        &rdquo;
      </p>

      {movieName && nameEmbedded && (
        <div className="mt-4 flex items-center gap-2 pt-3 border-t border-white/5">
          <span className="text-[10px] font-sans uppercase tracking-[0.15em] text-[#D4AF37]/60">Film</span>
          <span className="inline-block not-italic font-bold text-white bg-white/10 border border-white/20 rounded-md px-2 py-0.5 text-xs">
            {movieName}
          </span>
        </div>
      )}
    </div>
  );
};

export default UstadinNotu;
