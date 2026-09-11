"""CP Empires & Allies online service.

V58 adds:
- centralized PostgreSQL-backed saves for public deployment;
- stable ComePlayers account -> empire save mapping across devices;
- stable numeric game IDs derived from ComePlayers user IDs;
- ComePlayers friend filtering for neighbours, visits, tending and PvP;
- short-lived HMAC login tickets and iframe-safe headers;
- health/account diagnostics suitable for Docker deployment.
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import hmac
import importlib
import importlib.util
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Iterable

from itsdangerous import want_bytes
from sqlalchemy import text


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.production")
os.environ.setdefault("EDITOR", "notepad" if os.name == "nt" else "true")

spec = importlib.util.spec_from_file_location(
    "raise_the_empires_server", BASE_DIR / "empires-server.py"
)
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load empires-server.py")
legacy = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = legacy
spec.loader.exec_module(legacy)

from flask import jsonify, make_response, redirect, render_template, request, session  # noqa: E402
from werkzeug.middleware.proxy_fix import ProxyFix  # noqa: E402

app = legacy.app
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
socketio = legacy.socketio

TICKET_AUDIENCE = "comeplayers-empires-allies"
DEFAULT_ALLOWED_FRAMES = (
    "'self' https://comeplayers.com https://www.comeplayers.com "
    "http://localhost:3000 http://127.0.0.1:3000"
)
AVATARS = legacy.get_avail_avatars()
GAME_SAVE_KEYS = {
    "user_object",
    "quests",
    "battle",
    "last_battle",
    "fleets",
    "population",
    "saved",
    "saved_on",
    "save_version",
    "original_save_version",
    "backup",
    "profilePic",
}
_bootstrapped = False
_original_get_saves = legacy.get_saves
_original_get_zid = legacy.get_zid


# Ruffle resolves several legacy relative URLs against /comeplayers/play.
# Keep the public launch path while forwarding those requests to the recovered
# root endpoints expected by the original game client.
@app.get("/comeplayers/gameSettings.xml")
def comeplayers_game_settings_file():
    return legacy.game_settings_file()


@app.get("/comeplayers/127.0.0.1en_US.xml")
def comeplayers_language_file():
    return legacy.en_us_file()


@app.get("/comeplayers/127.0.0.1questSettings.xml")
def comeplayers_quest_settings_file():
    return legacy.quest_settings_file()


@app.route("/comeplayers/127.0.0.1record_stats.php", methods=["GET", "POST"])
def comeplayers_record_stats():
    return legacy.record_stats()


@app.post("/flashservices/gateway.php")
@app.post("/comeplayers/flashservices/gateway.php")
def comeplayers_gateway():
    """Expose the recovered AMF gateway at stable same-origin URLs."""
    return legacy.post_gateway()


@app.get("/comeplayers/assets/<path:path>")
def comeplayers_assets(path: str):
    return legacy.send_sol_assets_alternate(path)


@app.get("/comeplayers/nullassets/<path:path>")
def comeplayers_null_assets(path: str):
    return legacy.send_sol_assets(path)


def normalize_database_url(value: str) -> str:
    value = value.strip()
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value[len("postgres://") :]
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://") :]
    return value


def configure_app() -> None:
    database_url = normalize_database_url(os.getenv("DATABASE_URL", ""))
    if database_url:
        app.config["SQLALCHEMY_DATABASE_URI"] = database_url

    secret_key = os.getenv("FLASK_SECRET_KEY") or os.getenv(
        "EMPIRES_ALLIES_SHARED_SECRET", ""
    )
    if len(secret_key) < 32:
        raise RuntimeError(
            "FLASK_SECRET_KEY or EMPIRES_ALLIES_SHARED_SECRET must contain at least 32 characters."
        )

    app.config.update(
        SECRET_KEY=secret_key,
        SESSION_COOKIE_NAME=os.getenv(
            "COMEPLAYERS_SESSION_COOKIE", "cp_empires_session"
        ),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=os.getenv("COMEPLAYERS_COOKIE_SECURE", "0") == "1",
        SESSION_COOKIE_SAMESITE=os.getenv("COMEPLAYERS_COOKIE_SAMESITE", "Lax"),
        SESSION_SQLALCHEMY_TABLE=os.getenv(
            "COMEPLAYERS_SESSION_TABLE", "comeplayers_empires_sessions"
        ),
    )
    if os.getenv("COMEPLAYERS_COOKIE_PARTITIONED", "0") == "1":
        app.config["SESSION_COOKIE_PARTITIONED"] = True


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_ticket(ticket: str) -> dict[str, Any]:
    secret = os.getenv("EMPIRES_ALLIES_SHARED_SECRET", "")
    if len(secret) < 32:
        raise ValueError("Game service shared secret is not configured.")

    try:
        encoded_payload, supplied_signature = ticket.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid launch ticket.") from exc

    expected_signature = hmac.new(
        secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    try:
        supplied_signature_bytes = b64url_decode(supplied_signature)
    except Exception as exc:
        raise ValueError("Invalid launch ticket signature.") from exc

    if not hmac.compare_digest(expected_signature, supplied_signature_bytes):
        raise ValueError("Invalid launch ticket signature.")

    try:
        payload = json.loads(b64url_decode(encoded_payload).decode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid launch ticket payload.") from exc

    now = int(time.time())
    if payload.get("aud") != TICKET_AUDIENCE:
        raise ValueError("Invalid launch ticket audience.")
    if not isinstance(payload.get("sub"), str) or not payload["sub"]:
        raise ValueError("Invalid launch ticket user.")
    if int(payload.get("exp", 0)) < now:
        raise ValueError("Launch ticket expired.")
    if int(payload.get("iat", now + 1)) > now + 30:
        raise ValueError("Launch ticket is not active yet.")
    return payload


def clean_player_name(value: Any) -> str:
    text_value = "".join(ch for ch in str(value or "Commander") if ch.isprintable())
    text_value = " ".join(text_value.split()).strip()
    return (text_value or "Commander")[:32]


def avatar_for_user(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).digest()
    return AVATARS[digest[0] % len(AVATARS)]


def stable_game_uid(user_id: str) -> int:
    digest = hashlib.sha256(("comeplayers-empires:" + user_id).encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big") % 2_000_000_000
    return max(10_000, value)


def current_game_uid() -> int:
    value = session.get("comeplayers_game_uid")
    if isinstance(value, int) and value > 0:
        return value
    user_id = str(session.get("comeplayers_user_id") or "")
    if user_id:
        value = stable_game_uid(user_id)
        session["comeplayers_game_uid"] = value
        return value
    return _original_get_zid()


def session_model():
    return app.session_interface.sql_session_model


def decode_record(record: Any) -> dict[str, Any] | None:
    try:
        decoded = app.session_interface.serializer.decode(want_bytes(record.data))
        return dict(decoded) if decoded else None
    except Exception as error:
        print("Skipping unreadable account save:", error)
        return None


def create_online_tables() -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS comeplayers_game_accounts (
          user_id VARCHAR(64) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          game_uid BIGINT NOT NULL,
          display_name VARCHAR(80),
          avatar_url TEXT,
          world_name VARCHAR(120),
          level INTEGER NOT NULL DEFAULT 0,
          last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS cp_game_accounts_session_idx ON comeplayers_game_accounts(session_id)",
        "CREATE INDEX IF NOT EXISTS cp_game_accounts_seen_idx ON comeplayers_game_accounts(last_seen_at)",
    ]
    with legacy.db.engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def online_storage_status() -> tuple[bool, str | None]:
    if not normalize_database_url(os.getenv("DATABASE_URL", "")):
        return False, "DATABASE_URL is not configured."
    try:
        legacy.db.session.execute(text("SELECT 1")).scalar()
        legacy.db.session.execute(
            text("SELECT 1 FROM comeplayers_game_accounts LIMIT 1")
        ).first()
        return True, None
    except Exception as error:
        legacy.db.session.rollback()
        return False, str(error)[:240]


def account_row(user_id: str):
    return legacy.db.session.execute(
        text(
            "SELECT user_id,session_id,game_uid,display_name,avatar_url,world_name,level,last_seen_at "
            "FROM comeplayers_game_accounts WHERE user_id=:user_id"
        ),
        {"user_id": user_id},
    ).mappings().first()


def restore_account_save(user_id: str) -> None:
    row = account_row(user_id)
    current_sid = str(getattr(session, "sid", "") or "")
    if not row or not current_sid or str(row["session_id"]) == current_sid:
        return

    record = session_model().query.filter_by(session_id=str(row["session_id"])).first()
    if not record:
        return
    old_save = decode_record(record)
    if not old_save:
        return

    for key in GAME_SAVE_KEYS:
        if key in old_save:
            session[key] = copy.deepcopy(old_save[key])
    print("Restored ComePlayers empire save for", user_id)


def upsert_account(user_id: str, profile: dict[str, Any]) -> None:
    current_sid = str(getattr(session, "sid", "") or "")
    if not current_sid:
        return

    world_name = f"{clean_player_name(profile.get('name'))} Empire"[:40]
    level = 0
    try:
        level = int(session["user_object"]["userInfo"]["player"].get("level", 0))
        world_name = str(
            session["user_object"]["userInfo"].get("worldName") or world_name
        )[:120]
    except Exception:
        pass

    params = {
        "user_id": user_id,
        "session_id": current_sid,
        "game_uid": int(session.get("comeplayers_game_uid") or stable_game_uid(user_id)),
        "display_name": clean_player_name(profile.get("name")),
        "avatar_url": str(profile.get("avatar_url") or "")[:1000],
        "world_name": world_name,
        "level": level,
    }
    legacy.db.session.execute(
        text(
            """
            INSERT INTO comeplayers_game_accounts
              (user_id,session_id,game_uid,display_name,avatar_url,world_name,level,last_seen_at,created_at,updated_at)
            VALUES
              (:user_id,:session_id,:game_uid,:display_name,:avatar_url,:world_name,:level,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              session_id=excluded.session_id,
              game_uid=excluded.game_uid,
              display_name=excluded.display_name,
              avatar_url=excluded.avatar_url,
              world_name=excluded.world_name,
              level=excluded.level,
              last_seen_at=CURRENT_TIMESTAMP,
              updated_at=CURRENT_TIMESTAMP
            """
        ),
        params,
    )
    legacy.db.session.commit()


def install_profile(payload: dict[str, Any]) -> None:
    user_id = str(payload["sub"])
    existing_id = str(session.get("comeplayers_user_id") or "")
    if existing_id and existing_id != user_id:
        session.clear()

    restore_account_save(user_id)

    name = clean_player_name(payload.get("name"))
    friend_rows = payload.get("friends") if isinstance(payload.get("friends"), list) else []
    clean_friends = []
    for friend in friend_rows[:200]:
        if not isinstance(friend, dict):
            continue
        friend_id = str(friend.get("id") or "").strip()
        if not friend_id or friend_id == user_id:
            continue
        clean_friends.append(
            {
                "id": friend_id,
                "name": clean_player_name(friend.get("name")),
                "avatar": str(friend.get("avatar") or "")[:500],
            }
        )

    profile = {
        "name": name,
        "avatar_url": str(payload.get("avatar") or "")[:500],
        "avatar_file": avatar_for_user(user_id),
    }
    session["comeplayers_user_id"] = user_id
    session["comeplayers_game_uid"] = stable_game_uid(user_id)
    session["comeplayers_profile"] = profile
    session["comeplayers_friends"] = clean_friends
    session["comeplayers_friend_ids"] = [friend["id"] for friend in clean_friends]
    session["profilePic"] = profile["avatar_file"]
    session.permanent = True

    if "user_object" in session:
        session["user_object"]["userInfo"]["worldName"] = f"{name} Empire"[:40]
        session["user_object"]["userInfo"]["player"]["uid"] = current_game_uid()
    session.modified = True
    upsert_account(user_id, profile)


def account_saves(user_ids: Iterable[str]) -> list[dict[str, Any]]:
    wanted = {str(value) for value in user_ids if value}
    current_user = str(session.get("comeplayers_user_id") or "")
    wanted.discard(current_user)
    if not wanted:
        return []

    placeholders = ",".join(f":u{index}" for index, _ in enumerate(wanted))
    params = {f"u{index}": value for index, value in enumerate(wanted)}
    rows = legacy.db.session.execute(
        text(
            "SELECT user_id,session_id FROM comeplayers_game_accounts "
            f"WHERE user_id IN ({placeholders})"
        ),
        params,
    ).mappings().all()
    session_ids = [str(row["session_id"]) for row in rows if row.get("session_id")]
    user_by_session = {str(row["session_id"]): str(row["user_id"]) for row in rows}
    if not session_ids:
        return []

    records = session_model().query.filter(session_model().session_id.in_(session_ids)).all()
    saves: list[dict[str, Any]] = []
    for record in records:
        save = decode_record(record)
        if not save or "user_object" not in save:
            continue
        save["session_id"] = record.session_id
        save["comeplayers_user_id"] = save.get("comeplayers_user_id") or user_by_session.get(
            str(record.session_id)
        )
        saves.append(save)
    return saves


def comeplayers_get_saves() -> list[dict[str, Any]]:
    if os.getenv("COMEPLAYERS_EMBED_MODE", "1") != "1":
        return _original_get_saves()
    friend_ids = session.get("comeplayers_friend_ids") or []
    return account_saves(friend_ids)


def comeplayers_init_user():
    user = _original_init_user()
    profile = session.get("comeplayers_profile") or {}
    if profile:
        name = clean_player_name(profile.get("name"))
        user["userInfo"]["worldName"] = f"{name} Empire"[:40]
        user["userInfo"]["player"]["uid"] = current_game_uid()
        session["profilePic"] = profile.get("avatar_file") or avatar_for_user(
            str(session.get("comeplayers_user_id") or secrets.token_hex(8))
        )
    return user


_original_init_user = legacy.init_user
legacy.init_user = comeplayers_init_user
legacy.get_saves = comeplayers_get_saves
legacy.get_zid = current_game_uid

# Some legacy modules imported get_zid by value, so patch those references too.
for module_name in ("game_settings", "battle_engine"):
    try:
        module = importlib.import_module(module_name)
        module.get_zid = current_game_uid
    except Exception as error:
        print("Unable to patch", module_name, "get_zid:", error)


def queue_friend_attack_notification(defender_game_uid: Any) -> None:
    """Notify ComePlayers after the legacy PvP engine records an occupation."""
    attacker_user_id = str(session.get("comeplayers_user_id") or "").strip()
    webhook_url = str(os.getenv("COMEPLAYERS_EVENT_WEBHOOK_URL") or "").strip()
    shared_secret = str(os.getenv("COMEPLAYERS_SHARED_SECRET") or "").strip()
    if not attacker_user_id or not webhook_url or len(shared_secret) < 32:
        return

    try:
        defender = legacy.db.session.execute(
            text(
                "SELECT user_id FROM comeplayers_game_accounts "
                "WHERE game_uid=:game_uid LIMIT 1"
            ),
            {"game_uid": int(defender_game_uid)},
        ).mappings().first()
    except Exception as error:
        legacy.db.session.rollback()
        print("Unable to resolve attacked ComePlayers account:", error)
        return

    defender_user_id = str((defender or {}).get("user_id") or "").strip()
    if not defender_user_id or defender_user_id == attacker_user_id:
        return

    payload = json.dumps(
        {
            "event": "friend_attack",
            "eventId": str(uuid.uuid4()),
            "attackerUserId": attacker_user_id,
            "defenderUserId": defender_user_id,
            "occurredAt": int(time.time()),
        },
        separators=(",", ":"),
    ).encode("utf-8")

    def deliver() -> None:
        event_request = urllib.request.Request(
            webhook_url,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {shared_secret}",
                "Content-Type": "application/json",
                "User-Agent": "ComePlayers-Empires-Allies/1.0",
            },
        )
        try:
            with urllib.request.urlopen(event_request, timeout=5) as response:
                if response.status < 200 or response.status >= 300:
                    print("ComePlayers attack notification returned", response.status)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            # Notification delivery must never roll back the completed game attack.
            print("ComePlayers attack notification failed:", error)

    threading.Thread(
        target=deliver,
        name="comeplayers-attack-notification",
        daemon=True,
    ).start()


_original_occupation_place_response = legacy.occupation_place_response


def comeplayers_occupation_place_response(params: list[Any]):
    response = _original_occupation_place_response(params)
    if isinstance(response, dict) and int(response.get("errorType", 1)) == 0 and params:
        queue_friend_attack_notification(params[0])
    session.modified = True
    return response


legacy.occupation_place_response = comeplayers_occupation_place_response


@app.before_request
def secure_public_service():
    if os.getenv("COMEPLAYERS_EMBED_MODE", "1") != "1":
        return None

    blocked_exact = {
        "/login.html",
        "/list_session",
        "/save-editor",
        "/new.html",
        "/wipe_session",
        "/friends.html",
        "/language_editor",
        "/gazillionaire",
        "/deprogress",
    }
    blocked_prefixes = ("/chooseavatar/", "/patch/", "/seed/")
    if request.path == "/":
        if session.get("comeplayers_profile"):
            return redirect("/comeplayers/play", code=302)
        if os.getenv("COMEPLAYERS_ALLOW_GUEST", "0") == "1":
            return redirect("/comeplayers/guest", code=302)
        return (
            render_template(
                "comeplayers_error.html",
                message="Open CP Empires & Allies from ComePlayers Messages & Chat.",
            ),
            401,
        )
    if request.path in blocked_exact or request.path.startswith(blocked_prefixes):
        return make_response(
            "This legacy administration route is disabled in ComePlayers mode.", 403
        )
    return None


@app.after_request
def finalize_comeplayers_response(response):
    frame_ancestors = os.getenv(
        "COMEPLAYERS_FRAME_ANCESTORS", DEFAULT_ALLOWED_FRAMES
    ).strip()
    response.headers.pop("X-Frame-Options", None)
    response.headers["Content-Security-Policy"] = f"frame-ancestors {frame_ancestors}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.path.startswith("/comeplayers/") or request.path == "/healthz":
        response.headers["Cache-Control"] = "no-store, max-age=0"

    user_id = str(session.get("comeplayers_user_id") or "")
    autosave_request = request.method == "POST" and (
        request.path.endswith("flashservices/gateway.php")
        or request.path.endswith("record_stats.php")
    )
    if user_id and autosave_request:
        # The legacy engine mutates deeply nested dictionaries. Explicitly marking
        # the session prevents those mutations from being missed by Flask-Session.
        session["comeplayers_last_autosave_at"] = int(time.time())
        session.modified = True
        response.headers["X-ComePlayers-Autosave"] = "active"
    profile = session.get("comeplayers_profile") or {}
    last_touch = int(session.get("comeplayers_last_account_touch") or 0)
    now = int(time.time())
    if user_id and now - last_touch >= 30:
        try:
            session["comeplayers_last_account_touch"] = now
            upsert_account(user_id, profile)
        except Exception as error:
            legacy.db.session.rollback()
            print("Account heartbeat failed:", error)
    return response


@app.get("/healthz")
def healthz():
    account_count = 0
    try:
        account_count = int(
            legacy.db.session.execute(
                text("SELECT COUNT(*) FROM comeplayers_game_accounts")
            ).scalar()
            or 0
        )
    except Exception:
        legacy.db.session.rollback()
    online_ready, storage_error = online_storage_status()
    online_required = os.getenv("COMEPLAYERS_REQUIRE_ONLINE_STORAGE", "0") == "1"
    payload = {
        "ok": online_ready or not online_required,
        "ready": online_ready or not online_required,
        "service": "cp-empires-allies",
        "name": "CP Empires & Allies",
        "version": legacy.version,
        "onlineMode": online_ready,
        "onlineStorageRequired": online_required,
        "registeredEmpires": account_count,
        "storage": "postgresql" if online_ready else "sqlite",
        "ruffle": os.getenv(
            "RUFFLE_SCRIPT_URL", "https://unpkg.com/@ruffle-rs/ruffle"
        ),
    }
    if storage_error and online_required:
        payload["error"] = storage_error
    return jsonify(payload), 200 if payload["ok"] else 503


@app.get("/comeplayers/launch")
def comeplayers_launch():
    try:
        install_profile(verify_ticket(request.args.get("ticket", "")))
    except ValueError as error:
        return render_template("comeplayers_error.html", message=str(error)), 401
    except Exception as error:
        legacy.db.session.rollback()
        return render_template("comeplayers_error.html", message=str(error)), 503
    return redirect("/comeplayers/play", code=302)


@app.get("/comeplayers/guest")
def comeplayers_guest():
    if os.getenv("COMEPLAYERS_ALLOW_GUEST", "0") != "1":
        return (
            render_template(
                "comeplayers_error.html",
                message="Guest play is disabled. Open the game from ComePlayers Messages & Chat.",
            ),
            401,
        )
    if not session.get("comeplayers_user_id"):
        install_profile(
            {
                "sub": f"guest-{secrets.token_hex(8)}",
                "name": "Guest Commander",
                "avatar": "",
                "friends": [],
            }
        )
    return redirect("/comeplayers/play", code=302)


@app.get("/comeplayers/play")
def comeplayers_play():
    profile = session.get("comeplayers_profile")
    if not profile:
        if os.getenv("COMEPLAYERS_ALLOW_GUEST", "0") == "1":
            return redirect("/comeplayers/guest", code=302)
        return (
            render_template(
                "comeplayers_error.html",
                message="No active ComePlayers game session. Launch this game from Messages & Chat.",
            ),
            401,
        )

    if "user_object" in session:
        session["user_object"]["userInfo"]["worldName"] = (
            f"{clean_player_name(profile.get('name'))} Empire"[:40]
        )
        session["user_object"]["userInfo"]["player"]["uid"] = current_game_uid()
        session.modified = True

    saves = legacy.get_saves()
    return render_template(
        "comeplayers_play.html",
        time=legacy.datetime.now().timestamp(),
        zid=str(current_game_uid()),
        version=legacy.version,
        allies=json.dumps(
            legacy.get_allies_friend(saves),
            default=lambda _: "<not serializable>",
            sort_keys=False,
            indent=2,
        ),
        app_friends=json.dumps(legacy.get_allies_id(saves)),
        worldname=clean_player_name(profile.get("name")),
        picture="/img/avatars/" + str(profile.get("avatar_file") or "blank.png"),
        ruffle_script_url=os.getenv(
            "RUFFLE_SCRIPT_URL", "https://unpkg.com/@ruffle-rs/ruffle"
        ),
    )


def bootstrap() -> None:
    global _bootstrapped
    if _bootstrapped:
        return
    configure_app()
    legacy.set_crash_log(False)
    if legacy.compress is not None:
        legacy.compress.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins=[
            origin.strip()
            for origin in os.getenv(
                "COMEPLAYERS_CORS_ORIGINS",
                "https://comeplayers.com,https://www.comeplayers.com,http://localhost:3000,http://127.0.0.1:3000",
            ).split(",")
            if origin.strip()
        ],
    )
    legacy.db.init_app(app)
    legacy.sess.init_app(app)
    with app.app_context():
        legacy.db.create_all()
        create_online_tables()
    _bootstrapped = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CP Empires & Allies online service"
    )
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "5005")))
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bootstrap()
    socketio.run(
        app,
        host=args.host,
        port=args.port,
        debug=args.debug,
        allow_unsafe_werkzeug=True,
    )


if os.getenv("COMEPLAYERS_WSGI_BOOTSTRAP", "0") == "1":
    bootstrap()

if __name__ == "__main__":
    main()
