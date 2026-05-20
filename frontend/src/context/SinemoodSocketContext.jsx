import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { DIRECT_BASE } from '../utils/apiConfig';

/**
 * useSinemoodSocket — dedicated socket connection for a sinemood room session.
 *
 * Creates a socket.io connection scoped to a single room session lifecycle.
 * Automatically connects when roomId/userId are provided, disconnects on cleanup.
 * Listens for force_global_redirect (server-broadcasted navigation pulse) and
 * room_presence_update.
 *
 * @param {string|null} roomId  The room code (e.g. "SM-XJMA"). null/empty = no socket.
 * @param {string|null} userId  The current user's ID.
 * @returns {{ launchSharedSession: () => void, syncSelectedMoodAction: (moodId: string) => void, connectedUsers: Array }}
 */
export function useSinemoodSocket(roomId, userId) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });

  const [connectedUsers, setConnectedUsers] = useState([]);
  const socketRef = useRef(null);

  // Single effect: create socket, attach listeners, store ref, cleanup all
  useEffect(() => {
    if (!roomId || !userId) return;

    const isDev = import.meta.env.DEV;
    const serverUrl = isDev ? DIRECT_BASE : (import.meta.env.VITE_API_BASE_URL || DIRECT_BASE);

    const socket = io(serverUrl, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.emit('join_sinemod_session', { roomId, userId });

    const handleGlobalRedirect = (payload) => {
      navigateRef.current(payload.url || '/moodlar');
    };
    const handlePresenceUpdate = (payload) => {
      if (payload.connectedUsers) {
        setConnectedUsers(payload.connectedUsers);
      }
    };

    socket.on('force_global_redirect', handleGlobalRedirect);
    socket.on('room_presence_update', handlePresenceUpdate);

    return () => {
      socket.off('force_global_redirect', handleGlobalRedirect);
      socket.off('room_presence_update', handlePresenceUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, userId]);

  const launchSharedSession = useCallback(() => {
    socketRef.current?.emit('host_start_session_signal', { roomId });
  }, [roomId]);

  const syncSelectedMoodAction = useCallback((moodId) => {
    socketRef.current?.emit('client_mood_interaction', { roomId, moodId });
  }, [roomId]);

  return { launchSharedSession, syncSelectedMoodAction, connectedUsers };
}
