/**
 * Sinemood — SocketContext
 * Global Socket.IO connection + real-time co-watch state.
 *
 * Implements all frontend TODOs from the WebSocket architecture spec:
 *   [TODO 1] Unified Connection Point   — single socket, clean lifecycle
 *   [TODO 2] Real-Time Presence Rerender — room_presence_update → instant state
 *   [TODO 3] Audio & Visual Presence Chime — Web Audio API tone + systemNotification
 *   [TODO 4] Synchronized Redirect      — force_global_redirect → navigate
 *   [TODO 5] Two-Way Mirror State Engine — mirror_host_view → mirroredAction state
 *   [TODO 6] Loop & Crash Prevention    — every socket.on has explicit socket.off cleanup
 *
 * GLOBAL SESSION PERSISTENCE:
 *   roomId, isHost, participants, isLive, sessionUserId, sessionUserName
 *   all persist across page navigation (lifted from CouchMode local state).
 *   roomId also persisted to localStorage for tab-refresh recovery.
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

// ─── Web Audio chime — no network request, no external asset ──────────────────
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

  const navigateRef = useRef(navigate);
  const setGlobalMoodRef = useRef(setGlobalMood);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    setGlobalMoodRef.current = setGlobalMood;
  });

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

  // ── EFFECT 1 — Socket creation (once) ──
  useEffect(() => {
    const serverUrl = import.meta.env.DEV
      ? DIRECT_BASE
      : import.meta.env.VITE_API_BASE_URL || DIRECT_BASE;

    const socket = io(serverUrl, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── EFFECT 1b — Auto-rejoin on reconnect ──
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onReconnect = () => {
      const savedRoom = localStorage.getItem('activeRoomId');
      const savedUserId = localStorage.getItem('activeSessionUserId');
      const savedUserName =
        localStorage.getItem('activeSessionUserName') || 'Sinemasever';
      if (savedRoom && savedUserId) {
        socket.emit('join_sinemod_session', {
          roomId: savedRoom,
          userId: savedUserId,
          userName: savedUserName,
        });
      }
    };

    socket.on('connect', onReconnect);
    return () => {
      socket.off('connect', onReconnect);
    };
  }, []);

  // ── EFFECT 2 — Listener attachment (once) ──
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_presence_update', onRoomPresenceUpdate);
    socket.on('mood_changed_broadcast', onMoodChangedBroadcast);
    socket.on('force_global_redirect', onForceGlobalRedirect);
    socket.on('global_session_redirect', onGlobalSessionRedirect);
    socket.on('sync_view_to_mood', onSyncViewToMood);
    socket.on('mirror_host_view', onMirrorHostView);
    socket.on('host_navigation_sync', onHostNavigationSync);

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
    };
  }, []);

  // ── Public API ──

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

  const sendHostInteraction = useCallback((rId, actionType, payload) => {
    socketRef.current?.emit('host_interaction_event', {
      roomId: rId,
      actionType: actionType,
      payload: payload || {},
    });
  }, []);

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
