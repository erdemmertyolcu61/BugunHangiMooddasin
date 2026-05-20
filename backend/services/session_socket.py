"""
Sinemood Socket.IO — real-time session controller.
Mounts alongside FastAPI for room presence + mood sync.
"""
import socketio
import logging
from typing import Optional

logger = logging.getLogger("film_elestirimeni.socket")

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
)

# In-memory room sessions: { roomId: { users: [], activeMoodId: str|null } }
active_rooms: dict[str, dict] = {}

# sid → { room_id, user_id } for disconnect cleanup
_sid_map: dict[str, dict] = {}


def _get_or_create_room(room_id: str) -> dict:
    if room_id not in active_rooms:
        active_rooms[room_id] = {"users": [], "activeMoodId": None, "isLive": False}
    return active_rooms[room_id]


@sio.event
async def connect(sid, environ):
    logger.info(f"[Socket] Client connected: {sid}")


@sio.event
async def join_sinemod_session(sid, data):
    room_id = data.get("roomId")
    user_id = data.get("userId")
    user_name = data.get("userName", "Sinemasever")
    if not room_id or not user_id:
        return

    sio.enter_room(sid, room_id)
    _sid_map[sid] = {"room_id": room_id, "user_id": user_id}
    room = _get_or_create_room(room_id)

    # Add user if new
    existing = [u for u in room["users"] if u["id"] == user_id]
    if not existing:
        room["users"].append({"id": user_id, "name": user_name})
    else:
        existing[0]["name"] = user_name  # update name

    logger.info(f"[Socket] {user_name} ({user_id}) joined {room_id}")

    await sio.emit(
        "room_presence_update",
        {
            "connectedUsers": room["users"],
            "activeMoodId": room["activeMoodId"],
            "message": "Sinemood bağlantısı kuruldu evlat.",
        },
        room=room_id,
    )


@sio.event
async def select_session_mood(sid, data):
    room_id = data.get("roomId")
    mood_id = data.get("moodId")
    if not room_id or not mood_id:
        return

    room = active_rooms.get(room_id)
    if room:
        room["activeMoodId"] = mood_id
        logger.info(f"[Socket] Mood selected for {room_id}: {mood_id}")
        await sio.emit(
            "mood_changed_broadcast",
            {"moodId": mood_id},
            room=room_id,
        )


@sio.event
async def host_start_session_signal(sid, data):
    """
    THE CRITICAL FIX: The Global Navigation Pulse Engine.
    Receives the Host's ignition signal and broadcasts a
    force_global_redirect to ALL sockets in the room (including the Host).
    """
    room_id = data.get("roomId")
    if not room_id:
        logger.error("[Socket] Session signal aborted: Missing Room ID")
        return

    room = _get_or_create_room(room_id)
    room["isLive"] = True

    logger.info(f"[Socket] Host authorized launch sequence. Flushing room: {room_id}")

    # FORCE REDIRECT COMMAND TO ALL PIPES INSIDE THIS ROOM INSTANTLY
    # io.to(roomId).emit('force_global_redirect', ...) in python-socketio:
    await sio.emit(
        "force_global_redirect",
        {
            "url": "/moodlar",
            "timestamp": __import__('time').time(),
        },
        room=room_id,
    )


# Keep legacy event name for backward compatibility
host_initiated_start = host_start_session_signal


@sio.event
async def client_mood_interaction(sid, data):
    room_id = data.get("roomId")
    mood_id = data.get("moodId")
    mood_title = data.get("moodTitle", "")
    if not room_id or not mood_id:
        return

    room = active_rooms.get(room_id)
    if room and room.get("isLive"):
        room["activeMoodId"] = mood_id
        logger.info(f"[Socket] Room {room_id} synced to mood: {mood_title} ({mood_id})")

    await sio.emit(
        "sync_view_to_mood",
        {"moodId": mood_id, "moodTitle": mood_title},
        room=room_id,
    )


@sio.event
async def leave_sinemod_session(sid, data):
    room_id = data.get("roomId")
    user_id = data.get("userId")
    if not room_id or not user_id:
        return

    sio.leave_room(sid, room_id)
    _sid_map.pop(sid, None)
    room = active_rooms.get(room_id)
    if room:
        room["users"] = [u for u in room["users"] if u["id"] != user_id]
        if not room["users"]:
            del active_rooms[room_id]
            logger.info(f"[Socket] Room {room_id} closed (empty)")
        else:
            await sio.emit(
                "room_presence_update",
                {
                    "connectedUsers": room["users"],
                    "activeMoodId": room["activeMoodId"],
                    "message": "Bir sinema dostu odadan ayrıldı.",
                },
                room=room_id,
            )


@sio.event
async def disconnect(sid):
    info = _sid_map.pop(sid, None)
    if info:
        room_id = info["room_id"]
        user_id = info["user_id"]
        room = active_rooms.get(room_id)
        if room:
            room["users"] = [u for u in room["users"] if u["id"] != user_id]
            if not room["users"]:
                del active_rooms[room_id]
                logger.info(f"[Socket] Room {room_id} closed (disconnect)")
            else:
                await sio.emit(
                    "room_presence_update",
                    {
                        "connectedUsers": room["users"],
                        "activeMoodId": room["activeMoodId"],
                        "message": "Bir sinema dostu baglantiyi kaybetti.",
                    },
                    room=room_id,
                )
    logger.info(f"[Socket] Client disconnected: {sid}")
