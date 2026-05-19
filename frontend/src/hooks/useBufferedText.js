import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useBufferedText — Batched SSE Token Renderer
 *
 * Problem:
 *   SSE streams deliver text token-by-token. Each token triggers a state
 *   update → re-render → text reflow. On mobile devices this creates
 *   high CPU utilization and visible jank from 30+ re-renders per second.
 *
 * Solution:
 *   Decouple the incoming data stream from the UI update cycle.
 *   Tokens accumulate in a fast buffer (no renders). A rAF-synced
 *   flush loop batches buffer contents into React state once per frame
 *   (every ~16ms at 60fps, ~8ms at 120fps), producing exactly one
 *   re-render per display refresh.
 *
 * Usage:
 *   const { displayText, appendToken, reset, isStreaming } = useBufferedText();
 *
 *   // In SSE handler:
 *   onToken: (token) => appendToken(token)
 *
 *   // In JSX:
 *   <p>{displayText}</p>
 */
export default function useBufferedText() {
  const [displayText, setDisplayText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Fast buffer — tokens accumulate here without triggering renders.
  // Flushed to displayText on each animation frame.
  const bufferRef = useRef('');
  const committedRef = useRef('');
  const rafRef = useRef(null);
  const streamingRef = useRef(false);

  // rAF flush loop — runs once per display frame while streaming
  const flush = useCallback(() => {
    if (bufferRef.current.length > 0) {
      // Move buffer contents to committed string
      committedRef.current += bufferRef.current;
      bufferRef.current = '';
      // Single React state update per frame
      setDisplayText(committedRef.current);
    }

    // Continue loop while streaming
    if (streamingRef.current) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, []);

  // Start the rAF loop when streaming begins
  const startFlushLoop = useCallback(() => {
    if (rafRef.current) return; // already running
    streamingRef.current = true;
    setIsStreaming(true);
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  // Stop the loop and do a final flush
  const stopFlushLoop = useCallback(() => {
    streamingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Final flush — ensure no data left in buffer
    if (bufferRef.current.length > 0) {
      committedRef.current += bufferRef.current;
      bufferRef.current = '';
      setDisplayText(committedRef.current);
    }
    setIsStreaming(false);
  }, []);

  /**
   * Append a token to the buffer. Does NOT trigger a React render.
   * The rAF loop handles batching to display.
   */
  const appendToken = useCallback((token) => {
    if (!streamingRef.current) {
      startFlushLoop();
    }
    bufferRef.current += token;
  }, [startFlushLoop]);

  /**
   * Signal that the stream has ended. Flushes remaining buffer.
   */
  const finish = useCallback(() => {
    stopFlushLoop();
  }, [stopFlushLoop]);

  /**
   * Reset all state for a new stream.
   */
  const reset = useCallback(() => {
    stopFlushLoop();
    bufferRef.current = '';
    committedRef.current = '';
    setDisplayText('');
  }, [stopFlushLoop]);

  /**
   * Set full text at once (for non-streaming scenarios).
   */
  const setText = useCallback((text) => {
    stopFlushLoop();
    bufferRef.current = '';
    committedRef.current = text;
    setDisplayText(text);
  }, [stopFlushLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    displayText,
    appendToken,
    finish,
    reset,
    setText,
    isStreaming,
  };
}
