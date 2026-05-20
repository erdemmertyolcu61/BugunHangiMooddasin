/**
 * Sinemood — SocketContext
 * Global Socket.IO connection + real-time co-watch state.
 *
 * Implements all six frontend TODOs from the WebSocket architecture spec:
 *   [TODO 1] Unified Connection Point   — single socket, clean lifecycle
 *   [TODO 2] Real-Time Presence Rerender — room_presence_update → instant state
 *   [TODO 3] Audio & Visual Presence Chime — Web Audio API tone + systemNotification
 *   [TODO 4] Synchronized Redirect      — force_global_redirect → navigate
 *   [TODO 5] Two-Way Mirror State Engine — mirror_host_view → mirroredAction state
 *   [TODO 6] Loop & Crash Prevention    — every socket.on has explicit socket.off cleanup
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { DIRECT_BASE } from '../utils/apiConfig';
import { useMood } from './MoodContext';
import { useNavigate } from 'react-router-dom';

const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}

// ─── [TODO 3] Web Audio chime — no network request, no external asset ─────────
// Two-note ascending ding (880 Hz → 1100 Hz) that lasts ~450ms.
function _playJoinChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Frequency envelope: 880 Hz for first 120ms, then jump to 1100 Hz
    osc.frequency.setValueAtTime(880,  ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    // Amplitude envelope: fade in → sustain → fade out
    gain.gain.setValueAtTime(0,    ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + 0.30);
    gain.gain.linearRampToValueAtTime(0,   ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.50);
  } catch (_) {
    // Web Audio API unavailable (old browser, SSR) — silent fallback
  }
}


// ─── Provider ─────────────────────────────────────────────────────────────────

export function SocketProvider({ children }) {
  const navigate     = useNavigate();
  const { selectMood: setGlobalMood } = useMood();

  // ── Stable refs — updated each render so event handlers never go stale ──────
  const navigateRef     = useRef(navigate);
  const setGlobalMoodRef = useRef(setGlobalMood);
  useEffect(() => { navigateRef.current = navigate; });
  useEffect(() => { setGlobalMoodRef.current = setGlobalMood; });

  const socketRef          = useRef(null);
  const currentUserNameRef = useRef('');  // used to filter own-join notifications

  // ── State ────────────────────────────────────────────────────────────────────
  const [connected,          setConnected]          = useState(false);
  const [roomPresence,       setRoomPresence]        = useState(null);
  const [activeMoodId,       setActiveMoodId]        = useState(null);
  const [roomId,             setRoomId]              = useState(
    () => localStorage.getItem('activeRoomId') || null
  );
  // [TODO 3] Notification banner — "X kişisi odaya katıldı!" — clears after 4s
  const [systemNotification, setSystemNotification] = useState('');
  // [TODO 5] Mirror state — what the Host is hovering / selecting right now
  const [mirroredAction,     setMirroredAction]     = useState(null);

  // ───────────────────────────────────────────────────────────────────────────
  // EFFECT 1 — [TODO 1] Socket creation.
  // Runs exactly once on mount. Socket is destroyed on unmount.
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const serverUrl = import.meta.env.DEV
      ? DIRECT_BASE
      : (import.meta.env.VITE_API_BASE_URL || DIRECT_BASE);

    const socket = io(serverUrl, {
      path:               '/ws/socket.io',
      transports:         ['websocket', 'polling'],
      autoConnect:        true,     // connect immediately on construction
      reconnection:       true,
      reconnectionAttempts: 8,
      reconnectionDelay:  1200,
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // EFFECT 2 — Listener attachment.
  // Runs exactly once. All callbacks reference stable refs above so navigating
  // or changing global mood never triggers a teardown & reconnect cycle.
  //
  // [TODO 6] EVERY socket.on() has a matching socket.off() in the cleanup block.
  //          This permanently prevents React Error #300 and #310 loops.
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // ── [TODO 1] Connection state ─────────────────────────────────────────────
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    // ── [TODO 2] Real-Time UI Rerender — no refresh needed ───────────────────
    const onRoomPresenceUpdate = (data) => {
      setRoomPresence(data);
      if (data.activeMoodId) setActiveMoodId(data.activeMoodId);

      // ── [TODO 3] Audio + Visual Presence Chime ───────────────────────────
      // `joinedNotificationName` is set by the server ONLY when a brand-new
      // user enters. Empty string on reconnects or leave events.
      const newName = data.joinedNotificationName;
      if (newName && newName !== currentUserNameRef.current) {
        _playJoinChime();
        setSystemNotification(`${newName} odaya katıldı!`);
        // Auto-clear after 4 seconds
        setTimeout(() => setSystemNotification(''), 4000);
      }
    };

    const onMoodChangedBroadcast = (data) => {
      setActiveMoodId(data.moodId);
    };

    // ── [TODO 4] Synchronized Redirect ────────────────────────────────────────
    // Both Host and Guest receive this simultaneously from the server,
    // guaranteeing all clients navigate at the exact same millisecond.
    const onForceGlobalRedirect = (data) => {
      const url = data.url || '/moodlar';
      navigateRef.current(url);
    };

    // Legacy event (backward compat with older server versions)
    const onGlobalSessionRedirect = (data) => {
      const url = data.targetUrl || data.url || '/moodlar';
      navigateRef.current(url);
    };

    // Host picks final mood at /moodlar → Guest navigates to /discover
    const onSyncViewToMood = (data) => {
      if (data.moodId) {
        setActiveMoodId(data.moodId);
        setGlobalMoodRef.current(data.moodId);
        navigateRef.current('/discover');
      }
    };

    // ── [TODO 5] Two-Way Mirror State Engine ─────────────────────────────────
    // Receives Host interaction events; exposes mirroredAction for Guest UI.
    const onMirrorHostView = (data) => {
      setMirroredAction({ actionType: data.actionType, payload: data.payload });
    };

    // Register all listeners
    socket.on('connect',                onConnect);
    socket.on('disconnect',             onDisconnect);
    socket.on('room_presence_update',   onRoomPresenceUpdate);
    socket.on('mood_changed_broadcast', onMoodChangedBroadcast);
    socket.on('force_global_redirect',  onForceGlobalRedirect);
    socket.on('global_session_redirect', onGlobalSessionRedirect);
    socket.on('sync_view_to_mood',      onSyncViewToMood);
    socket.on('mirror_host_view',       onMirrorHostView);

    // ── [TODO 6] Explicit teardown — prevents listener accumulation ───────────
    return () => {
      socket.off('connect',                onConnect);
      socket.off('disconnect',             onDisconnect);
      socket.off('room_presence_update',   onRoomPresenceUpdate);
      socket.off('mood_changed_broadcast', onMoodChangedBroadcast);
      socket.off('force_global_redirect',  onForceGlobalRedirect);
      socket.off('global_session_redirect', onGlobalSessionRedirect);
      socket.off('sync_view_to_mood',      onSyncViewToMood);
      socket.off('mirror_host_view',       onMirrorHostView);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * [TODO 1] Join a room — single unified connection point.
   * Passes roomId, userId, userName immediately.
   * Socket.IO buffers the emit if the TCP handshake isn't done yet,
   * so there is no race condition to guard against.
   */
  const joinRoom = useCallback((rId, userId, userName) => {
    currentUserNameRef.current = userName || 'Sinemasever';
    setRoomId(rId);
    localStorage.setItem('activeRoomId', rId);
    // Use OLD event name for maximum backward compat during rolling deploys.
    // New backend handles both join_sinemod_session AND join_sinemood_session.
    // Old backend ONLY knows join_sinemod_session.
    socketRef.current?.emit('join_sinemod_session', {
      roomId:   rId,
      userId,
      userName: userName || 'Sinemasever',
    });
  }, []);

  const leaveRoom = useCallback((rId, userId) => {
    setRoomId(null);
    setRoomPresence(null);
    setMirroredAction(null);
    setSystemNotification('');
    localStorage.removeItem('activeRoomId');
    socketRef.current?.emit('leave_sinemod_session', { roomId: rId, userId });
  }, []);

  const selectMood = useCallback((rId, moodId) => {
    socketRef.current?.emit('select_session_mood', { roomId: rId, moodId });
  }, []);

  /**
   * [TODO 3] Session Ignition — emits host_start_session_signal.
   * Backend receives this and calls io.to(roomId).emit('force_global_redirect')
   * so BOTH Host and Guest navigate simultaneously (see TODO 4 handler above).
   */
  const startSharedSession = useCallback((rId) => {
    socketRef.current?.emit('host_start_session_signal', { roomId: rId });
  }, []);

  const syncRoomMoodView = useCallback((rId, selection) => {
    socketRef.current?.emit('client_mood_interaction', { roomId: rId, ...selection });
  }, []);

  /**
   * [TODO 4] Host Interaction Mirror — fires host_interaction_event.
   * Backend echoes it back as mirror_host_view to all Guests (skip_sid = Host).
   * Use this for hover highlights, selection previews, etc.
   */
  const sendHostInteraction = useCallback((rId, actionType, payload = {}) => {
    socketRef.current?.emit('host_interaction_event', {
      roomId: rId,
      actionType,
      payload,
    });
  }, []);

  return (
    <SocketContext.Provider value={{
      // State
      connected,
      roomPresence,
      activeMoodId,
      roomId,
      systemNotification,   // [TODO 3] "X odaya katıldı!" — 4s banner
      mirroredAction,       // [TODO 5] { actionType, payload } from Host
      // Actions
      joinRoom,
      leaveRoom,
      selectMood,
      startSharedSession,   // [TODO 3] ignition — was broken via useSinemoodSocket
      syncRoomMoodView,
      sendHostInteraction,  // [TODO 4] host UI mirror emitter
    }}>
      {children}
    </SocketContext.Provider>
  );
}
