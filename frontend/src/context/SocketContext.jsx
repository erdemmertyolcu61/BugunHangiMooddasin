import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { DIRECT_BASE } from '../utils/apiConfig';
import { useMood } from './MoodContext';
import { useNavigate } from 'react-router-dom';

const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }) {
  const navigate = useNavigate();
  const { selectMood: setGlobalMood } = useMood();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomPresence, setRoomPresence] = useState(null);
  const [activeMoodId, setActiveMoodId] = useState(null);
  const [roomId, setRoomId] = useState(() => localStorage.getItem('activeRoomId') || null);

  useEffect(() => {
    const isDev = import.meta.env.DEV;
    const serverUrl = isDev ? DIRECT_BASE : (import.meta.env.VITE_API_BASE_URL || DIRECT_BASE);

    const socket = io(serverUrl, {
      path: '/ws/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('room_presence_update', (data) => {
      setRoomPresence(data);
      if (data.activeMoodId) setActiveMoodId(data.activeMoodId);
    });

    socket.on('mood_changed_broadcast', (data) => {
      setActiveMoodId(data.moodId);
    });

    socket.on('global_session_redirect', (data) => {
      navigate(data.targetUrl || '/moodlar');
    });

    socket.on('sync_view_to_mood', (data) => {
      if (data.moodId) {
        setActiveMoodId(data.moodId);
        setGlobalMood(data.moodId);
        navigate('/discover');
      }
    });

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [navigate, setGlobalMood]);

  const joinRoom = (rId, userId, userName) => {
    setRoomId(rId);
    localStorage.setItem('activeRoomId', rId);
    socketRef.current?.emit('join_sinemod_session', { roomId: rId, userId, userName });
  };

  const selectMood = (rId, moodId) => {
    socketRef.current?.emit('select_session_mood', { roomId: rId, moodId });
  };

  const leaveRoom = (rId, userId) => {
    setRoomId(null);
    setRoomPresence(null);
    localStorage.removeItem('activeRoomId');
    socketRef.current?.emit('leave_sinemod_session', { roomId: rId, userId });
  };

  const startSharedSession = (rId) => {
    socketRef.current?.emit('host_initiated_start', { roomId: rId });
  };

  const syncRoomMoodView = (rId, selection) => {
    socketRef.current?.emit('client_mood_interaction', { roomId: rId, ...selection });
  };

  return (
    <SocketContext.Provider value={{
      connected, roomPresence, activeMoodId, roomId,
      joinRoom, selectMood, leaveRoom, startSharedSession, syncRoomMoodView,
    }}>
      {children}
    </SocketContext.Provider>
  );
}
