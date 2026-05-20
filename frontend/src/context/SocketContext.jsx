/**
 * Sinemood — SocketContext
 * Global Socket.IO connection + real-time co-watch state.
 *
 * ARCHITECTURE:
 *   - Single socket instance created ONCE at mount, destroyed ONCE at unmount.
 *   - ALL listeners attached in the SAME effect as socket creation to prevent
 *     the connect-event-missed race condition (autoConnect fires before a
 *     separate useEffect can attach its listener).
 *   - Session state (roomId, isHost, participants, isLive) persisted in React
 *     state + localStorage — survives page navigation within the SPA.
 *   - Auto-rejoin on reconnect via localStorage credentials.
 *
 * TODOs implemented:
 *   [TODO 1] Absolute Session Persistence & Reconnection
 *   [TODO 2] Dynamic Status Sync (Kopuk → Aktif)
 *   [TODO 3] Zero-Delay Presence & Chime Alert
 *   [TODO 4] Host Action Reflection Layer
 *   [TODO 5] Total Event Leakage Cleanup
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { io } from 'socket.io-client';
import { DIRECT_BASE } from '../utils/apiConfig';
import { useMood } from './MoodContext';
import { useNavigate } from 'react-router-dom';

const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}

// ─── Web Audio chime ──────────────────────────────────────────────────────────
function _playJoinChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + 0.30);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.50);
  } catch (_) {
    /* silent fallback */
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SocketProvider({ children }) {
  const navigate = useNavigate();
  const { selectMood: setGlobalMood } = useMood();

  // Stable refs — updated each render so event handlers never go stale
  const navigateRef = useRef(navigate);
  const setGlobalMoodRef = useRef(setGlobalMood);
  useEffect(() => { navigateRef.current = navigate; });
  useEffect(() => { setGlobalMoodRef.current = setGlobalMood; });

  const socketRef = useRef(null);
  const currentUserNameRef = useRef('');

  // ── Core Connection State ──
  const [connected, setConnected] = useState(false);

  // ── GLOBAL SESSION STATE (persists across navigation) ──
  const [roomId, setRoomId] = useState(
    () => localStorage.getItem('activeRoomId') || null,
  );
  const [isHost, setIsHost] = useState(
    () => localStorage.getItem('activeRoomIsHost') === 'true',
  );
  const [isLive, setIsLive] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [sessionUserId, setSessionUserId] = useState(
    () => localStorage.getItem('activeSessionUserId') || null,
  );
  const [sessionUserName, setSessionUserName] = useState(
    () => localStorage.getItem('activeSessionUserName') || '',
  );
  const [activeMoodId, setActiveMoodId] = useState(null);
  const [systemNotification, setSystemNotification] = useState('');
  const [mirroredAction, setMirroredAction] = useState(null);
  const [roomPresence, setRoomPresence] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE UNIFIED EFFECT — Socket creation + ALL listener attachment.
  //
  // [TODO 1] CRITICAL FIX: Socket is created with autoConnect:true, meaning
  // the 'connect' event fires during construction. If listeners are in a
  // SEPARATE useEffect, they miss the initial connect → "Kopuk" forever.
  // Merging everything into ONE effect guarantees listeners are attached
  // BEFORE the socket's first connect event can fire.
  //
  // [TODO 5] Every socket.on() has a matching socket.off() in cleanup.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const serverUrl = import.meta.env.DEV
      ? DIRECT_BASE
      : import.meta.env.VITE_API_BASE_URL || DIRECT_BASE;

    // Create socket but DON'T auto-connect yet — attach listeners first
    const socket = io(serverUrl, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,          // ← CRITICAL: connect AFTER listeners
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1200,
    });

    socketRef.current = socket;

    // ── [TODO 2] Connection state — instant Kopuk → Aktif toggle ──
    const onConnect = () => {
      setConnected(true);

      // [TODO 1] Auto-rejoin room on reconnect
      const savedRoom = localStorage.getItem('activeRoomId');
      const savedUserId = localStorage.getItem('activeSessionUserId');
      const savedUserName = localStorage.getItem('activeSessionUserName') || 'Sinemasever';
      if (savedRoom && savedUserId) {
        socket.emit('join_sinemod_session', {
          roomId: savedRoom,
          userId: savedUserId,
          userName: savedUserName,
        });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    // ── [TODO 3] Zero-Delay Presence & Chime ──
    const onRoomPresenceUpdate = (data) => {
      setRoomPresence(data);

      const newParticipants = (data.participants || data.connectedUsers || []).map(
        (p, i) => ({
          userId: p.userId || p.id,
          name: p.name,
          role: p.role || (i === 0 ? 'HOST' : 'GUEST'),
        }),
      );
      setParticipants(newParticipants);

      if (typeof data.isLive === 'boolean') {
        setIsLive(data.isLive);
      }
      if (data.activeMoodId) setActiveMoodId(data.activeMoodId);

      // Audio chime + notification for new arrivals
      const newName = data.joinedNotificationName;
      if (newName && newName !== currentUserNameRef.current) {
        _playJoinChime();
        setSystemNotification(newName + ' odaya katıldı!');
        setTimeout(() => setSystemNotification(''), 4000);
      }
    };

    const onMoodChangedBroadcast = (data) => {
      setActiveMoodId(data.moodId);
    };

    // ── [TODO 4] Synchronized Redirect ──
    const onForceGlobalRedirect = (data) => {
      const url = data.url || '/moodlar';
      setIsLive(true);
      navigateRef.current(url);
    };

    const onGlobalSessionRedirect = (data) => {
      const url = data.targetUrl || data.url || '/moodlar';
      navigateRef.current(url);
    };

    const onSyncViewToMood = (data) => {
      if (data.moodId) {
        setActiveMoodId(data.moodId);
        setGlobalMoodRef.current(data.moodId);
        navigateRef.current('/discover');
      }
    };

    // ── [TODO 4] Host Action Reflection ──
    const onMirrorHostView = (data) => {
      setMirroredAction({ actionType: data.actionType, payload: data.payload });
    };

    const onHostNavigationSync = (data) => {
      if (data.url) {
        navigateRef.current(data.url);
      }
      if (data.moodId) {
        setActiveMoodId(data.moodId);
        setGlobalMoodRef.current(data.moodId);
      }
    };

    // ── Attach ALL listeners BEFORE connecting ──
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_presence_update', onRoomPresenceUpdate);
    socket.on('mood_changed_broadcast', onMoodChangedBroadcast);
    socket.on('force_global_redirect', onForceGlobalRedirect);
    socket.on('global_session_redirect', onGlobalSessionRedirect);
    socket.on('sync_view_to_mood', onSyncViewToMood);
    socket.on('mirror_host_view', onMirrorHostView);
    socket.on('host_navigation_sync', onHostNavigationSync);

    // ── NOW connect — listeners are guaranteed to catch the event ──
    socket.connect();

    // ── [TODO 5] Total Event Leakage Cleanup ──
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_presence_update', onRoomPresenceUpdate);
      socket.off('mood_changed_broadcast', onMoodChangedBroadcast);
      socket.off('force_global_redirect', onForceGlobalRedirect);
      socket.off('global_session_redirect', onGlobalSessionRedirect);
      socket.off('sync_view_to_mood', onSyncViewToMood);
      socket.off('mirror_host_view', onMirrorHostView);
      socket.off('host_navigation_sync', onHostNavigationSync);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  const joinRoom = useCallback((rId, userId, userName, hostFlag) => {
    const name = userName || 'Sinemasever';
    currentUserNameRef.current = name;

    setRoomId(rId);
    setSessionUserId(userId);
    setSessionUserName(name);
    setIsHost(!!hostFlag);
    setIsLive(false);
    setMirroredAction(null);

    localStorage.setItem('activeRoomId', rId);
    localStorage.setItem('activeSessionUserId', userId);
    localStorage.setItem('activeSessionUserName', name);
    localStorage.setItem('activeRoomIsHost', String(!!hostFlag));

    socketRef.current?.emit('join_sinemod_session', {
      roomId: rId,
      userId: userId,
      userName: name,
    });
  }, []);

  const leaveRoom = useCallback((rId, userId) => {
    setRoomId(null);
    setRoomPresence(null);
    setMirroredAction(null);
    setSystemNotification('');
    setParticipants([]);
    setIsHost(false);
    setIsLive(false);
    setActiveMoodId(null);
    setSessionUserId(null);
    setSessionUserName('');

    localStorage.removeItem('activeRoomId');
    localStorage.removeItem('activeSessionUserId');
    localStorage.removeItem('activeSessionUserName');
    localStorage.removeItem('activeRoomIsHost');

    socketRef.current?.emit('leave_sinemod_session', { roomId: rId, userId: userId });
  }, []);

  const selectMood = useCallback((rId, moodId) => {
    socketRef.current?.emit('select_session_mood', { roomId: rId, moodId: moodId });
  }, []);

  const startSharedSession = useCallback((rId) => {
    socketRef.current?.emit('host_start_session_signal', { roomId: rId });
  }, []);

  const syncRoomMoodView = useCallback((rId, selection) => {
    socketRef.current?.emit('client_mood_interaction', { roomId: rId, ...selection });
  }, []);

  // [TODO 4] Host Interaction Mirror
  const sendHostInteraction = useCallback((rId, actionType, payload) => {
    socketRef.current?.emit('host_interaction_event', {
      roomId: rId,
      actionType: actionType,
      payload: payload || {},
    });
  }, []);

  // Host Navigation Sync
  const sendHostNavigation = useCallback((rId, url, extra) => {
    socketRef.current?.emit('host_navigation_sync', {
      roomId: rId,
      url: url,
      ...(extra || {}),
    });
  }, []);

  return (
    <SocketContext.Provider
      value={{
        connected,
        roomId,
        isHost,
        isLive,
        participants,
        sessionUserId,
        sessionUserName,
        activeMoodId,
        roomPresence,
        systemNotification,
        mirroredAction,
        joinRoom,
        leaveRoom,
        selectMood,
        startSharedSession,
        syncRoomMoodView,
        sendHostInteraction,
        sendHostNavigation,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}
