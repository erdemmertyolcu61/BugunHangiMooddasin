import React from 'react';

const UstadinNotu = ({ noteText, movieName }) => {
  if (!noteText && !movieName) return null;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber/40 mb-4">Üstadın Notu</p>
      <p className="text-lg sm:text-3xl font-playfair italic leading-relaxed sm:leading-[1.25] text-ivory tracking-tight first-letter:text-4xl sm:first-letter:text-6xl first-letter:float-left first-letter:mr-3 first-letter:font-bold first-letter:text-amber">
        {noteText}
      </p>
    </div>
  );
};

export default UstadinNotu;
