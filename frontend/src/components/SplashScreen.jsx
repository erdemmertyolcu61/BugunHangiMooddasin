import React, { useEffect, useState } from 'react';
import '../styles/SplashScreen.css';
import sinemoodLogo from '../assets/sinemod_logo.png';

const SplashScreen = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onFinish) {
        onFinish();
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!isVisible) {
    return null;
  }

  const renderParticles = () => {
    return Array.from({ length: 20 }).map((_, i) => (
      <div 
        key={i} 
        className="particle" 
        style={{
          left: `${Math.random() * 100}%`,
          width: `${Math.random() * 2 + 1}px`,
          height: `${Math.random() * 2 + 1}px`,
          animationDelay: `${Math.random() * 6}s`,
          animationDuration: `${Math.random() * 5 + 5}s`
        }}
      />
    ));
  };

  return (
    <div className="splash-screen">
      <div className="liquid-wave-container">
        <div className="liquid-wave" />
      </div>
      {renderParticles()}
      <div className="splash-logo-wrapper">
        <img src={sinemoodLogo} alt="Sinemood" className="splash-logo" />
      </div>
      <div className="splash-text-wrapper">
        <h1 className="splash-title">SINEMOOD</h1>
        <p className="splash-subtitle">Premium Film Deneyimi</p>
      </div>
    </div>
  );
};

export default SplashScreen;
