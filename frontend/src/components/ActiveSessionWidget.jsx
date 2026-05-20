/**
 * ActiveSessionWidget — Persistent Floating Room Panel
 *
 * Renders ONLY when a co-watch session is active (roomId exists in SocketContext).
 * Fixed to top-right corner, visible on ALL pages during an active session.
 *
 * Theme: Sinemood Premium Dark
 *   Base:   #000000
 *   Gold:   #d4af37
 *   Surface: rgba(212,175,55, 0.08)
 *   Border:  rgba(212,175,55, 0.20)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Copy, Check, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { couchLeave } from '../services/api';

export default function ActiveSessionWidget() {
  const {
    roomId,
    isHost,
    isLive,
    participants,
    connected,
    sessionUserId,
    leaveRoom,
  } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Don't render if no active session
  if (!roomId) return null;

  const participantCount = participants.length || 1;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async (e) => {
    e.stopPropagation();
    try { await couchLeave(roomId); } catch {}
    leaveRoom(roomId, sessionUserId || String(user?.id));
    setExpanded(false);
    navigate('/couch');
  };

  return (
    <div className="fixed top-4 right-4 z-[9999]" style={{ pointerEvents: 'auto' }}>
      <AnimatePresence mode="wait">
        {!expanded ? (
          /* ── Collapsed: pill with pulsing gold dot ── */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full cursor-pointer select-none"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid rgba(212,175,55,0.25)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 12px rgba(212,175,55,0.15)',
            }}
          >
            {/* Pulsing gold indicator */}
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  backgroundColor: isLive ? '#d4af37' : '#6b7280',
                  opacity: 0.6,
                  animationDuration: '1.8s',
                }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ backgroundColor: isLive ? '#d4af37' : '#6b7280' }}
              />
            </span>

            {/* Room code */}
            <span
              className="font-mono text-xs font-bold tracking-wider"
              style={{ color: '#d4af37' }}
            >
              {roomId}
            </span>

            {/* Participant count */}
            <span className="flex items-center gap-1">
              <Users size={11} style={{ color: 'rgba(212,175,55,0.7)' }} />
              <span
                className="text-[10px] font-bold"
                style={{ color: 'rgba(212,175,55,0.8)' }}
              >
                {participantCount}
              </span>
            </span>
          </motion.button>
        ) : (
          /* ── Expanded: full panel ── */
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: 'spring', stiffness: 350, damping: 26 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.92)',
              border: '1px solid rgba(212,175,55,0.20)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(212,175,55,0.1)',
              minWidth: 240,
              maxWidth: 280,
            }}
          >
            {/* Header */}
            <button
              onClick={() => setExpanded(false)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
              style={{ borderBottom: '1px solid rgba(212,175,55,0.12)' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{
                      backgroundColor: isLive ? '#d4af37' : '#6b7280',
                      opacity: 0.6,
                      animationDuration: '1.8s',
                    }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ backgroundColor: isLive ? '#d4af37' : '#6b7280' }}
                  />
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: 'rgba(212,175,55,0.7)' }}
                >
                  {isLive ? 'CANLI SEANS' : 'LOBİ'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {connected ? (
                  <Wifi size={11} style={{ color: '#22c55e' }} />
                ) : (
                  <WifiOff size={11} style={{ color: '#ef4444' }} />
                )}
                <span
                  className="text-[9px] font-bold"
                  style={{ color: connected ? '#22c55e' : '#ef4444' }}
                >
                  {connected ? 'Bağlı' : 'Kopuk'}
                </span>
              </div>
            </button>

            {/* Room code + copy */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-[8px] font-bold uppercase tracking-[0.3em] mb-1"
                    style={{ color: 'rgba(212,175,55,0.5)' }}
                  >
                    ODA KODU
                  </p>
                  <p
                    className="font-mono text-lg font-black tracking-[0.1em]"
                    style={{ color: '#d4af37' }}
                  >
                    {roomId}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg transition-all hover:scale-105"
                  style={{ background: 'rgba(212,175,55,0.1)' }}
                >
                  {copied ? (
                    <Check size={14} style={{ color: '#22c55e' }} />
                  ) : (
                    <Copy size={14} style={{ color: '#d4af37' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Participants */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(212,175,55,0.08)' }}>
              <p
                className="text-[8px] font-bold uppercase tracking-[0.3em] mb-2"
                style={{ color: 'rgba(212,175,55,0.5)' }}
              >
                ODADAKILER ({participantCount})
              </p>
              <div className="space-y-1.5">
                {participants.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: 'rgba(212,175,55,0.12)',
                        color: '#d4af37',
                        border: '1px solid rgba(212,175,55,0.20)',
                      }}
                    >
                      {(p.name || 'S')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold truncate"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        {p.name || 'Sinemasever'}
                      </p>
                    </div>
                    <span
                      className="text-[8px] font-bold uppercase tracking-wider"
                      style={{
                        color: p.role === 'HOST'
                          ? '#d4af37'
                          : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {p.role === 'HOST' ? 'Host' : 'Guest'}
                    </span>
                  </div>
                ))}

                {participants.length === 0 && (
                  <p
                    className="text-[10px] italic"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    Bağlanıyor...
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={() => { setExpanded(false); navigate('/couch'); }}
                className="text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  color: '#d4af37',
                  background: 'rgba(212,175,55,0.08)',
                  border: '1px solid rgba(212,175,55,0.15)',
                }}
              >
                Odaya Git
              </button>
              <button
                onClick={handleLeave}
                className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                style={{
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                <LogOut size={10} />
                Ayrıl
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
