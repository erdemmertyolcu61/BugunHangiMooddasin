import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { DIRECT_BASE } from '../utils/apiConfig';

const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [roomPresence, setRoomPresence] = useState(null);
  const [activeMoodId, setActiveMoodId] = useState(null);

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

    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinRoom = (roomId, userId, userName) => {
    socketRef.current?.emit('join_sinemod_session', { roomId, userId, userName });
  };

  const selectMood = (roomId, moodId) => {
    socketRef.current?.emit('select_session_mood', { roomId, moodId });
  };

  const leaveRoom = (roomId, userId) => {
    socketRef.current?.emit('leave_sinemod_session', { roomId, userId });
  };

  return (
    <SocketContext.Provider value={{
      connected, roomPresence, activeMoodId,
      joinRoom, selectMood, leaveRoom,
    }}>
      {children}
    </SocketContext.Provider>
  );
}
