import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Sofa, LogOut, ChevronRight, ChevronLeft, Shield } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { couchStatus, couchLeave } from '../services/api';

export default function PersistentSidebar() {
  const { roomId, roomPresence, leaveRoom } = useSocket();
  const { user } = useAuth();
  
  const [isOpen, setIsOpen] = useState(true);
  const [membersInfo, setMembersInfo] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch full profiles with pictures when presence updates or on mount
  useEffect(() => {
    if (!roomId) return;
    
    let isMounted = true;
    const fetchRoomDetails = async () => {
      setLoading(true);
      try {
        const details = await couchStatus(roomId);
        if (isMounted && details?.members) {
          setMembersInfo(details.members);
        }
      } catch (err) {
        console.error('[Sidebar] Error fetching members:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRoomDetails();

    return () => {
      isMounted = false;
    };
  }, [roomId, roomPresence]);

  if (!roomId) return null;

  const connectedUsers = roomPresence?.connectedUsers || [];
  
  // Merge real-time online state from socket presence into fetched members info
  const displayMembers = membersInfo.map(member => {
    const isOnline = connectedUsers.some(cu => String(cu.id) === String(member.user_id));
    return {
      ...member,
      isOnline
    };
  });

  // If there are members in presence that aren't fetched yet, show them as fallback
  connectedUsers.forEach(cu => {
    if (!displayMembers.some(m => String(m.user_id) === String(cu.id))) {
      displayMembers.push({
        user_id: cu.id,
        name: cu.name,
        picture: null,
        role: 'guest',
        isOnline: true
      });
    }
  });

  const handleLeave = async () => {
    if (!window.confirm('Bu gruptan ayrılmak istediğine emin misin?')) return;
    try {
      await couchLeave(roomId);
    } catch (err) {
      console.error(err);
    }
    if (user?.id) {
      leaveRoom(roomId, String(user.id));
    }
  };

  const activeCount = displayMembers.filter(m => m.isOnline).length;

  return (
    <div className="fixed top-24 right-4 z-[99] flex flex-col items-end pointer-events-none">
      {/* Toggle Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full bg-black/90 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:border-amber-400/60 transition-all font-sans text-xs font-semibold shrink-0"
      >
        <Sofa size={14} className="animate-pulse text-amber-500" />
        <span>Seans {activeCount > 0 ? `(${activeCount} Aktif)` : ''}</span>
        {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </motion.button>

      {/* Floating Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 15, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="pointer-events-auto mt-3 w-72 bg-[#000000]/95 backdrop-blur-md border border-amber-500/25 rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.8),_inset_0_1px_0_rgba(245,158,11,0.1)] flex flex-col gap-4 max-h-[70vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-amber-500" />
                <h3 className="font-serif font-bold text-xs tracking-wider text-ivory uppercase" style={{ letterSpacing: '0.08em' }}>
                  Şu Anda Odadakiler
                </h3>
              </div>
              <span className="font-mono text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {roomId}
              </span>
            </div>

            {/* Members List */}
            <div className="flex flex-col gap-3">
              {displayMembers.map((member) => (
                <div key={member.user_id} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 hover:border-amber-500/10 transition-all">
                  {/* Avatar */}
                  <div className="relative">
                    {member.picture ? (
                      <img src={member.picture} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-amber-500/20" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/10 ring-1 ring-amber-500/20">
                        <Users size={12} className="text-amber-500" />
                      </div>
                    )}
                    {/* Pulsing online status indicator */}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${
                      member.isOnline 
                        ? 'bg-amber-500 shadow-[0_0_8px_#d97706]' 
                        : 'bg-zinc-600'
                    }`} />
                  </div>

                  {/* Name and Role */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-serif font-bold text-xs text-ivory truncate">{member.name || 'Sinemasever'}</p>
                      {member.role === 'host' && (
                        <Shield size={10} className="text-amber-500 shrink-0" title="Ev Sahibi" />
                      )}
                    </div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mt-0.5">
                      {member.role === 'host' ? 'Ev Sahibi' : 'Misafir'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Leave Room Button */}
            <button
              onClick={handleLeave}
              className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-rose-500/20 bg-rose-950/15 hover:bg-rose-900/20 hover:border-rose-500/40 text-rose-400 text-[10px] font-bold uppercase tracking-wider transition-all"
            >
              <LogOut size={12} />
              Odadan Ayrıl
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
