import { useState, useEffect, useRef, useCallback } from 'react';

export default function useSpeechRecognition({
  onResult,
  onError,
  onEnd,
  lang = 'tr-TR',
  continuous = false,
  interimResults = false
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  // Keep callbacks in a ref to avoid re-triggering useEffect when parent component re-renders
  const callbacksRef = useRef({ onResult, onError, onEnd });
  useEffect(() => {
    callbacksRef.current = { onResult, onError, onEnd };
  });

  // Initialize SpeechRecognition
  useEffect(() => {
    console.log('Initializing SpeechRecognition...');
    
    // Check permission status
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((status) => {
        console.log('Browser microphone permission status:', status.state);
      }).catch(err => {
        console.warn('Could not query microphone permission status:', err);
      });
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition is NOT supported in this browser.');
      setError('not_supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => {
      console.log('SpeechRecognition onstart event fired.');
      setIsListening(true);
      setError(null);
    };

    recognition.onerror = (event) => {
      console.error('SpeechRecognition onerror event fired:', event.error, event);
      setError(event.error);
      setIsListening(false);
      if (callbacksRef.current.onError) {
        callbacksRef.current.onError(event.error);
      }
    };

    recognition.onend = () => {
      console.log('SpeechRecognition onend event fired.');
      setIsListening(false);
      if (callbacksRef.current.onEnd) {
        callbacksRef.current.onEnd();
      }
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      console.log('SpeechRecognition onresult event fired. Transcript:', transcript);
      if (callbacksRef.current.onResult) {
        callbacksRef.current.onResult(transcript);
      }
    };

    recognitionRef.current = recognition;
    console.log('SpeechRecognition initialized successfully.');

    return () => {
      if (recognitionRef.current) {
        console.log('Aborting SpeechRecognition during cleanup.');
        recognitionRef.current.abort();
      }
    };
  }, [lang, continuous, interimResults]); // Dependencies are static options now

  const startListening = useCallback(() => {
    console.log('startListening called. recognitionRef.current is:', !!recognitionRef.current, 'isListening is:', isListening);
    if (!recognitionRef.current) return;
    if (!isListening) {
      try {
        recognitionRef.current.start();
        console.log('recognitionRef.current.start() was called.');
      } catch (err) {
        console.error('Failed to start speech recognition in try-catch:', err);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    console.log('stopListening called. recognitionRef.current is:', !!recognitionRef.current, 'isListening is:', isListening);
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
        console.log('recognitionRef.current.stop() was called.');
      } catch (err) {
        console.error('Failed to stop speech recognition in try-catch:', err);
      }
    }
  }, [isListening]);

  return {
    isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    isListening,
    error,
    startListening,
    stopListening
  };
}
