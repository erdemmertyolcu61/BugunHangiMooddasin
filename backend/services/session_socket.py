"""
Sinemood Socket.IO — Real-Time Co-Watch Session Controller.

Implements:
  [TODO 1] Memory Room Store      — participants with HOST/GUEST roles + isLive flag
  [TODO 2] Dynamic Presence       — immediate room_presence_update broadcast on join
  [TODO 3] Global Session Ignition — host_start_session_signal → io.to(room).emit
  [TODO 4] Interactive Action Sync — host_interaction_event → mirror_host_view to guests

Event name policy:
  Canonical (new):  join_sinemood_session   / leave_sinemood_session
  Legacy compat:    join_sinemod_session    / leave_sinemod_session
  Both are handled identically via _handle_join / _handle_leave.
"""
import socketio
import logging
import time

logger = logging.getLogger("film_elestirimeni.socket")

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
)

# ─── [TODO 1] In-Memory Room Store ────────────────────────────────────────────
#
# active_rooms[roomId] = {
#   "participants": [
#     { "userId": str, "name": str, "sid": str, "role": "HOST" | "GUEST" }
#   ],
#   "isLive":      bool,
#   "activeMoodId": str | None,
# }
#
active_rooms: dict[str, dict] = {}

# sid → { room_id, user_id }  —  used for disconnect cleanup
_sid_map: dict[str, dict] = {}


def _get_or_create_room(room_id: str) -> dict:
    if room_id not in active_rooms:
        active_rooms[room_id] = {
            "participants": [],
            "isLive": False,
            "activeMoodId": None,
        }
    return active_rooms[room_id]


def _presence_payload(room: dict, joined_name: str = "") -> dict:
    """
    Build the payload for room_presence_update.
    `joined_name` is non-empty only when a NEW user just connected;
    the frontend uses it to trigger the audio chime and notification.
    """
    participants = [
        {"userId": p["userId"], "name": p["name"], "role": p["role"]}
        for p in room["participants"]
    ]
    return {
        # New canonical key
        "participants": participants,
        # Legacy key — SocketContext backward compat
        "connectedUsers": [
            {"id": p["userId"], "name": p["name"], "role": p["role"]}
            for p in room["participants"]
        ],
        "activeMoodId": room["activeMoodId"],
        "isLive": room["isLive"],
        # Non-empty ONLY when a new user just joined (triggers chime on frontend)
        "joinedNotificationName": joined_name,
    }


# ─── Connect / Disconnect ─────────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    logger.info(f"[Socket] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    info = _sid_map.get(sid)
    if info:
        await _handle_leave(info["room_id"], info["user_id"], sid)
    logger.info(f"[Socket] Client disconnected: {sid}")


# ─── [TODO 2] Join — Dynamic Presence Trigger ─────────────────────────────────

async def _handle_join(sid: str, room_id: str, user_id: str, user_name: str):
    """
    Core join logic shared by both canonical and legacy event handlers.

    Steps:
      1. Enter the socket.io room channel.
      2. Upsert participant in the in-memory store (HOST if first, GUEST otherwise).
      3. Immediately broadcast room_presence_update to ALL sockets in the room,
         including the joiner, with joinedNotificationName set to the new arrival.
    """
    if not room_id or not user_id:
        return

    # 1. Enter socket.io room (enables io.to(room_id).emit targeting)
    sio.enter_room(sid, room_id)
    _sid_map[sid] = {"room_id": room_id, "user_id": user_id}

    # 2. Upsert participant
    room = _get_or_create_room(room_id)
    existing = next((p for p in room["participants"] if p["userId"] == user_id), None)

    if existing:
        # Reconnect or name update — refresh socket id + name
        existing["sid"] = sid
        existing["name"] = user_name
        # Don't announce reconnects as new joins
        joined_name = ""
    else:
        # Brand-new participant: first = HOST, rest = GUEST
        role = "HOST" if not room["participants"] else "GUEST"
        room["participants"].append({
            "userId": user_id,
            "name": user_name,
            "sid": sid,
            "role": role,
        })
        joined_name = user_name  # triggers chime on every OTHER client

    logger.info(
        f"[Socket] {user_name} ({'reconnect' if not joined_name else 'join'}) "
        f"room={room_id} sid={sid}"
    )

    # 3. Broadcast presence to ALL in the room immediately
    await sio.emit(
        "room_presence_update",
        _presence_payload(room, joined_name=joined_name),
        room=room_id,
    )


@sio.event
async def join_sinemood_session(sid, data):
    """Canonical join event (Sinemood — double-o)."""
    await _handle_join(
        sid,
        data.get("roomId", ""),
        data.get("userId", ""),
        data.get("userName", "Sinemasever"),
    )


@sio.event
async def join_sinemod_session(sid, data):
    """Legacy join event (Sinemod — single-o) — backward compat."""
    await _handle_join(
        sid,
        data.get("roomId", ""),
        data.get("userId", ""),
        data.get("userName", "Sinemasever"),
    )


# ─── [TODO 3] Global Session Ignition ─────────────────────────────────────────

@sio.event
async def host_start_session_signal(sid, data):
    """
    THE IGNITION ENGINE.

    Sets isLive = True, then uses io.to(roomId).emit('force_global_redirect')
    to push a navigation command to ALL sockets in the room — including the Host.

    CRITICAL: This uses sio.emit(room=...) NOT socket.broadcast.to(...)
    so the Host socket also receives the packet and navigates simultaneously.
    """
    room_id = data.get("roomId")
    if not room_id:
        logger.error("[Socket] host_start_session_signal: missing roomId")
        return

    room = _get_or_create_room(room_id)
    room["isLive"] = True

    logger.info(f"[Socket] 🚀 Session ignition — room={room_id}")

    # Broadcast to ALL (Host + all Guests) simultaneously
    await sio.emit(
        "force_global_redirect",
        {
            "url": "/moodlar",
            "roomId": room_id,
            "timestamp": time.time(),
        },
        room=room_id,
        # No skip_sid — Host must receive this too
    )


# ─── [TODO 4] Interactive Action Sync ─────────────────────────────────────────

@sio.event
async def host_interaction_event(sid, data):
    """
    MIRROR ENGINE.

    Catches any UI interaction from the Host (hover, selection highlight, etc.)
    and immediately rebroadcasts it to Guests only.

    Uses skip_sid=sid so the Host (sender) does NOT receive its own echo.
    Only fires when the session isLive to prevent noise during lobby.
    """
    room_id = data.get("roomId")
    action_type = data.get("actionType")
    payload = data.get("payload", {})

    if not room_id or not action_type:
        return

    room = active_rooms.get(room_id)
    if not room or not room.get("isLive"):
        return

    logger.debug(f"[Socket] Host interaction — room={room_id} action={action_type}")

    # Emit only to OTHER sockets in the room (Guests), not back to the Host
    await sio.emit(
        "mirror_host_view",
        {"actionType": action_type, "payload": payload},
        room=room_id,
        skip_sid=sid,
    )


# ─── Mood Selection Sync ──────────────────────────────────────────────────────

@sio.event
async def select_session_mood(sid, data):
    """Lobby-phase mood selection — syncs activeMoodId to all room members."""
    room_id = data.get("roomId")
    mood_id = data.get("moodId")
    if not room_id or not mood_id:
        return

    room = active_rooms.get(room_id)
    if room:
        room["activeMoodId"] = mood_id
        logger.info(f"[Socket] Mood set — room={room_id} mood={mood_id}")
        await sio.emit("mood_changed_broadcast", {"moodId": mood_id}, room=room_id)


@sio.event
async def client_mood_interaction(sid, data):
    """
    Post-session mood interaction — Host selects a mood at /moodlar,
    Guest's viewport syncs to the same mood and navigates to /discover.
    """
    room_id = data.get("roomId")
    mood_id = data.get("moodId")
    mood_title = data.get("moodTitle", "")
    if not room_id or not mood_id:
        return

    room = active_rooms.get(room_id)
    if room and room.get("isLive"):
        room["activeMoodId"] = mood_id
        logger.info(f"[Socket] Mood interaction — room={room_id} mood={mood_id}")

    await sio.emit(
        "sync_view_to_mood",
        {"moodId": mood_id, "moodTitle": mood_title},
        room=room_id,
    )


# ─── Leave Room ───────────────────────────────────────────────────────────────

async def _handle_leave(room_id: str, user_id: str, sid: str):
    """Shared leave/disconnect logic."""
    if not room_id or not user_id:
        return

    try:
        sio.leave_room(sid, room_id)
    except Exception:
        pass
    _sid_map.pop(sid, None)

    room = active_rooms.get(room_id)
    if not room:
        return

    # Remove participant
    leaving_name = next(
        (p["name"] for p in room["participants"] if p["userId"] == user_id),
        "Sinemasever",
    )
    room["participants"] = [p for p in room["participants"] if p["userId"] != user_id]

    if not room["participants"]:
        del active_rooms[room_id]
        logger.info(f"[Socket] Room {room_id} closed (empty after {leaving_name} left)")
    else:
        logger.info(f"[Socket] {leaving_name} left room={room_id}")
        await sio.emit(
            "room_presence_update",
            _presence_payload(room, joined_name=""),
            room=room_id,
        )


@sio.event
async def leave_sinemood_session(sid, data):
    """Canonical leave event."""
    await _handle_leave(data.get("roomId", ""), data.get("userId", ""), sid)


@sio.event
async def leave_sinemod_session(sid, data):
    """Legacy leave event — backward compat."""
    await _handle_leave(data.get("roomId", ""), data.get("userId", ""), sid)
