#!/usr/bin/env python3
"""Serve m-e621 dist/ + same-origin API proxies and optional git-pull control.

FurAffinity: install faapi (`uv venv .venv && uv pip install -r requirements.txt`).
Optional FA_COOKIE_A / FA_COOKIE_B for host-wide login.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlparse


def _prepend_venv() -> None:
    """Prefer a local .venv so faapi can be installed without system pip."""
    root = Path(__file__).resolve().parent
    for site in (root / ".venv").glob("lib/python*/site-packages"):
        path = str(site)
        if path not in sys.path:
            sys.path.insert(0, path)
        break


_prepend_venv()


def _load_dotenv(path: Path) -> None:
    """Load KEY=VALUE lines into os.environ without overriding existing keys."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if value.startswith("~/"):
            value = str(Path.home() / value[2:])
        elif value == "$HOME" or value.startswith("$HOME/"):
            value = str(Path.home() / value[len("$HOME") :].lstrip("/"))
        os.environ[key] = value


_REPO_DIR = Path(__file__).resolve().parent
_CONFIG_DIR_EARLY = Path(
    os.environ.get("M_E621_CONFIG", Path.home() / ".config" / "m-e621")
).expanduser()
_load_dotenv(_CONFIG_DIR_EARLY / "env")
_load_dotenv(_REPO_DIR / "deploy.env")

ROOT = Path(os.environ.get("M_E621_ROOT", Path.home() / "m-e621" / "dist")).resolve()
APP_DIR = Path(os.environ.get("M_E621_DIR", ROOT.parent)).resolve()
CONFIG_DIR = Path(os.environ.get("M_E621_CONFIG", Path.home() / ".config" / "m-e621")).resolve()
HOST = os.environ.get("M_E621_HOST", "127.0.0.1")
PORT = int(os.environ.get("M_E621_PORT", "18621"))
DOMAIN = os.environ.get("M_E621_DOMAIN", "localhost")
BRANCH = os.environ.get("M_E621_BRANCH", "master")
TOKEN_PATH = CONFIG_DIR / "pull_token"
STATUS_PATH = CONFIG_DIR / "pull_status.json"
FAVORITE_HOSTS = frozenset({"e621.net", "e926.net", "e6ai.net"})
FAVORITE_PATH = re.compile(r"^/api/favorites(?:/(\d+))?$")
VOTES_PATH = re.compile(r"^/api/votes/?$")
COMMENTS_PATH = re.compile(r"^/api/comments/?$")
MEDIA_HOST_SUFFIXES = (".e621.net", ".e926.net", ".e6ai.net")
TAILSPACE_BASE = "https://tailspace.com"
TAILSPACE_CDN = "https://pics.tailspace.com"
TAILSPACE_POSTS_PATH = re.compile(r"^/api/tailspace/posts$")
TAILSPACE_COMICS_PATH = re.compile(r"^/api/tailspace/comics$")
TAILSPACE_COMIC_PATH = re.compile(r"^/api/tailspace/comic$")
TAILSPACE_COMMENTS_PATH = re.compile(r"^/api/tailspace/comments$")
TAILSPACE_FEED_PATH = re.compile(r"^/api/tailspace/feed$")
TAILSPACE_AUTH_POSTS = {
    "/api/tailspace/login",
    "/api/tailspace/login-cookies",
    "/api/tailspace/me",
    "/api/tailspace/logout",
    "/api/tailspace/like",
    "/api/tailspace/star",
    "/api/tailspace/comment",
    "/api/tailspace/follow",
}
TAILSPACE_SESSION_HEADER = "X-Tailspace-Session"

FURBOORU_BASE = "https://furbooru.org"
FURBOORU_IMAGES_PATH = re.compile(r"^/api/furbooru/images$")
FURBOORU_TAGS_PATH = re.compile(r"^/api/furbooru/tags$")
FURBOORU_COMMENTS_GET_PATH = re.compile(r"^/api/furbooru/comments$")
FURBOORU_USER_PATH = re.compile(r"^/api/furbooru/user$")
FURBOORU_FAVES_PATH = re.compile(r"^/api/furbooru/images/(\d+)/faves$")
FURBOORU_VOTES_PATH = re.compile(r"^/api/furbooru/images/(\d+)/votes$")
FURBOORU_COMMENTS_POST_PATH = re.compile(r"^/api/furbooru/comments$")

INKBUNNY_BASE = "https://inkbunny.net"
INKBUNNY_POST_ROUTES = {
    "/api/inkbunny/login": "api_login.php",
    "/api/inkbunny/logout": "api_logout.php",
    "/api/inkbunny/ratings": "api_userrating.php",
    "/api/inkbunny/search": "api_search.php",
    "/api/inkbunny/submissions": "api_submissions.php",
    "/api/inkbunny/watchlist": "api_watchlist.php",
}
INKBUNNY_KEYWORDS_PATH = re.compile(r"^/api/inkbunny/keywords$")
INKBUNNY_MEDIA_HOSTS = frozenset({"inkbunny.net", "ib.metapix.net"})
FURAFFINITY_PATH = re.compile(r"^/api/furaffinity/([a-z]+)$")
FURAFFINITY_MEDIA_SUFFIXES = (".furaffinity.net", ".facdn.net")
FURAFFINITY_MEDIA_HOSTS = frozenset({"furaffinity.net", "www.furaffinity.net", "facdn.net"})

WEASYL_API_BASE = "https://www.weasyl.com"
WEASYL_MEDIA_HOSTS = frozenset({"www.weasyl.com", "weasyl.com", "cdn.weasyl.com", "static.weasyl.com"})
WEASYL_FRONTPAGE_PATH = re.compile(r"^/api/weasyl/frontpage$")
WEASYL_SEARCH_PATH = re.compile(r"^/api/weasyl/search$")
WEASYL_SUBMISSION_PATH = re.compile(r"^/api/weasyl/submission/(\d+)$")
WEASYL_GALLERY_PATH = re.compile(r"^/api/weasyl/gallery/([^/]+)$")
WEASYL_FAVORITES_PATH = re.compile(r"^/api/weasyl/favorites/([^/]+)$")
WEASYL_USER_PATH = re.compile(r"^/api/weasyl/user/([^/]+)$")
WEASYL_WHOAMI_PATH = re.compile(r"^/api/weasyl/whoami$")

FLUFFLE_API = "https://api.fluffle.xyz/exact-search-by-file"
FLUFFLE_UA = "m-e621/1.0 (by lovelyspacedog on GitHub)"
FLUFFLE_PATH = "/api/fluffle/exact-search"
# Extra CDN hosts allowed only for Fluffle source fetch (not general /api/download).
FLUFFLE_EXTRA_HOSTS = frozenset({"furrycdn.org", "pics.tailspace.com"})
FLUFFLE_EXTRA_SUFFIXES = (".furrycdn.org",)

_pull_lock = threading.Lock()
_state: dict = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "message": "",
    "before": None,
    "after": None,
    "log_tail": "",
}


def _ensure_token() -> str:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if TOKEN_PATH.is_file():
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if token:
            return token
    token = secrets.token_urlsafe(24)
    TOKEN_PATH.write_text(token + "\n", encoding="utf-8")
    TOKEN_PATH.chmod(0o600)
    print(f"m-e621 created pull token at {TOKEN_PATH}", flush=True)
    return token


def _write_status() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        **_state,
        "head": _git_head(),
        "branch": BRANCH,
        "server_time": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    STATUS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _git_head() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(APP_DIR), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _run(cmd: list[str], log: list[str]) -> None:
    log.append(f"$ {' '.join(cmd)}")
    proc = subprocess.run(
        cmd,
        cwd=str(APP_DIR),
        text=True,
        capture_output=True,
        env={
            **os.environ,
            "VITE_CANONICAL_URL": f"https://{DOMAIN}",
            "VITE_APP_DOMAIN": DOMAIN,
            "VITE_ENABLE_GIT_PULL": "true",
            "VITE_GOOGLE_SITE_VERIFICATION_META": "",
        },
    )
    if proc.stdout:
        log.append(proc.stdout.rstrip())
    if proc.stderr:
        log.append(proc.stderr.rstrip())
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd)}")


def _write_env_local() -> None:
    (APP_DIR / ".env.local").write_text(
        "\n".join(
            [
                f"VITE_CANONICAL_URL=https://{DOMAIN}",
                f"VITE_APP_DOMAIN={DOMAIN}",
                "VITE_ENABLE_GIT_PULL=true",
                "VITE_GOOGLE_SITE_VERIFICATION_META=",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _do_pull() -> None:
    log: list[str] = []
    before = _git_head()
    _state.update(
        {
            "running": True,
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "finished_at": None,
            "ok": None,
            "message": "pulling",
            "before": before,
            "after": None,
            "log_tail": "",
        }
    )
    _write_status()
    try:
        _write_env_local()
        _run(["git", "fetch", "--quiet", "origin", BRANCH], log)
        _run(["git", "merge", "--ff-only", f"origin/{BRANCH}"], log)
        after = _git_head()
        _state["after"] = after
        _state["message"] = "building" if after != before else "up to date; rebuilding"
        _write_status()
        # Always rebuild so baked commit metadata / UI changes land.
        if not (APP_DIR / "node_modules").is_dir():
            _run(["npm", "ci"], log)
        else:
            _run(["npm", "ci", "--prefer-offline"], log)
        _run(["npm", "run", "build-only"], log)
        # FurAffinity needs faapi in APP_DIR/.venv (serve.py prepends it to sys.path).
        req = APP_DIR / "requirements.txt"
        if req.is_file():
            venv = APP_DIR / ".venv"
            if not venv.is_dir():
                if shutil.which("uv"):
                    _run(["uv", "venv", str(venv)], log)
                else:
                    _run([sys.executable, "-m", "venv", str(venv)], log)
            if shutil.which("uv"):
                _run(["uv", "pip", "install", "-r", str(req)], log)
            else:
                _run([str(venv / "bin" / "pip"), "install", "-r", str(req)], log)
        _state.update(
            {
                "running": False,
                "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "ok": True,
                "message": "done" if after != before else "rebuilt (already on latest)",
                "after": after,
                "log_tail": "\n".join(log[-40:]),
            }
        )
        # Bounce the HTTP process so new serve.py routes (e.g. FurAffinity) load.
        # Delay so this status write and the API response can finish first.
        # FORCE_RESTART bypasses start's "already running" short-circuit.
        restart_cmd = (
            f"sleep 2; "
            f"pkill -f '{APP_DIR}/serve.py' || true; "
            f"rm -f '{CONFIG_DIR}/m-e621.pid'; "
            f"sleep 1; "
            f"M_E621_FORCE_RESTART=1 '{APP_DIR}/start'"
        )
        subprocess.Popen(
            ["bash", "-c", restart_cmd],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        log.append("$ scheduled serve.py restart")
        _state["log_tail"] = "\n".join(log[-40:])
    except Exception as exc:  # noqa: BLE001 — surface any failure to API client
        _state.update(
            {
                "running": False,
                "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "ok": False,
                "message": str(exc),
                "log_tail": "\n".join(log[-40:]),
            }
        )
    _write_status()


def _start_pull() -> bool:
    if not _pull_lock.acquire(blocking=False):
        return False

    def runner() -> None:
        try:
            _do_pull()
        finally:
            _pull_lock.release()

    threading.Thread(target=runner, name="m-e621-pull", daemon=True).start()
    return True


# ---------------------------------------------------------------------------
# Tailspace turbo-stream parser
# ---------------------------------------------------------------------------
# React Router's `.data` endpoint serialises loader data as a flat value
# pool (a JSON array).  The root value lives at index 0.  Objects in the
# pool use the `{"_N": M}` encoding: the key is `pool[N]` (a string) and
# the value is `pool[M]` (another pool reference or inline primitive).
# Negative indices are sentinel shortcuts:
#   -5 → null / None
#   -7 → false / False
#   -6 → true  / True  (best-guess; add more as discovered)

_TS_SENTINELS: dict[int, object] = {-5: None, -6: True, -7: False}


def _ts_decode_pool(pool: list) -> object:
    """Walk a turbo-stream flat pool and return the decoded root value."""
    cache: dict[int, object] = {}

    def decode(ref: object) -> object:
        if not isinstance(ref, int):
            return ref  # inline primitive
        if ref in _TS_SENTINELS:
            return _TS_SENTINELS[ref]
        if ref < 0:
            return None  # unknown sentinel → null
        if ref in cache:
            return cache[ref]
        if ref >= len(pool):
            return None
        entry = pool[ref]
        result = decode_val(entry)
        cache[ref] = result
        return result

    def decode_val(val: object) -> object:
        if isinstance(val, dict):
            result: dict = {}
            for k, v in val.items():
                if k.startswith("_") and k[1:].lstrip("-").isdigit():
                    key_idx = int(k[1:])
                    actual_key = decode(key_idx)
                    actual_val = decode(v) if isinstance(v, int) else decode_val(v)
                    if actual_key is not None:
                        result[str(actual_key)] = actual_val
                else:
                    result[k] = decode(v) if isinstance(v, int) else decode_val(v)
            return result
        if isinstance(val, list):
            # Typed values: ["D", ms] is a Date literal — do NOT treat ms as a pool ref.
            if len(val) >= 2 and val[0] == "D":
                ms = val[1]
                return ms if isinstance(ms, (int, float)) else None
            return [decode(item) if isinstance(item, int) else decode_val(item) for item in val]
        return val

    return decode(0)


def _find_key(obj: object, key: str) -> object | None:
    """Recursively find the first value for `key` in a nested structure."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for value in obj.values():
            found = _find_key(value, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_key(item, key)
            if found is not None:
                return found
    return None


def _find_comics_payload(obj: object) -> dict | None:
    """Recursively find an object containing comicsAndAds (nested under RR routes)."""
    if isinstance(obj, dict):
        if "comicsAndAds" in obj:
            return obj
        for value in obj.values():
            found = _find_comics_payload(value)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_comics_payload(item)
            if found is not None:
                return found
    return None


def _parse_tailspace_comics_response(raw: bytes) -> dict:
    """Parse a tailspace /browse.data response into a clean dict."""
    text = raw.decode("utf-8", errors="replace").strip()

    # ── Try plain JSON first (format may change) ────────────────────────────
    if text.startswith("{") or text.startswith("["):
        try:
            data = json.loads(text)
            # Plain object
            if isinstance(data, dict) and "comicsAndAds" in data:
                return _extract_comics_payload(data)
            # Pool array — comicsAndAds lives under routes/pages/browse/BrowsePage
            if isinstance(data, list):
                decoded = _ts_decode_pool(data)
                found = _find_comics_payload(decoded)
                if found is not None:
                    return _extract_comics_payload(found)
        except (json.JSONDecodeError, Exception):
            pass

    # ── Try multi-line turbo-stream (each line is a JSON chunk) ────────────
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for line in lines:
        try:
            chunk = json.loads(line)
            found = _find_comics_payload(chunk)
            if found is not None:
                return _extract_comics_payload(found)
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse tailspace comics response (first 200 chars): {text[:200]!r}")


def _extract_comics_payload(data: dict) -> dict:
    raw_list = data.get("comicsAndAds") or []
    # Ads use string ids + link; real comics have numeric id + name.
    comics = [
        item for item in raw_list
        if isinstance(item, dict)
        and isinstance(item.get("id"), int)
        and item.get("name")
        and not item.get("ad")
        and not item.get("link")
    ]
    return {
        "comics": comics,
        "numberOfPages": int(data.get("numberOfPages") or 1),
        "totalNumComics": int(data.get("totalNumComics") or len(comics)),
    }


def _parse_tailspace_post_comments(raw: bytes) -> list:
    """Extract the comments array from a post .data turbo-stream response."""
    text = raw.decode("utf-8", errors="replace").strip()
    data = json.loads(text)
    if isinstance(data, dict):
        comments = data.get("comments")
        if isinstance(comments, list):
            return _normalize_comments(comments)
        found = _find_key(data, "comments")
        if isinstance(found, list):
            return _normalize_comments(found)
    if isinstance(data, list):
        decoded = _ts_decode_pool(data)
        found = _find_key(decoded, "comments")
        if isinstance(found, list):
            return _normalize_comments(found)
    return []


def _normalize_comments(comments: list) -> list:
    out: list[dict] = []
    for item in comments:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        if item.get("isHidden"):
            continue
        ts = item.get("timestamp")
        if isinstance(ts, list) and len(ts) >= 2 and ts[0] == "D":
            ts = ts[1]
        out.append(
            {
                "id": item.get("id"),
                "userId": item.get("userId"),
                "username": item.get("username") or "unknown",
                "profilePictureToken": item.get("profilePictureToken"),
                "comment": item.get("comment") or "",
                "replyToCommentId": item.get("replyToCommentId"),
                "timestamp": ts,
                "isHidden": bool(item.get("isHidden")),
            }
        )
    # Newest first (null timestamps last; tie-break by id).
    out.sort(
        key=lambda c: (
            0 if c.get("timestamp") is None else 1,
            c.get("timestamp") or 0,
            c.get("id") or 0,
        ),
        reverse=True,
    )
    return out


def _find_comic_detail(obj: object) -> dict | None:
    """Find the comic object that includes a pages[] array."""
    if isinstance(obj, dict):
        pages = obj.get("pages")
        if (
            isinstance(pages, list)
            and isinstance(obj.get("id"), int)
            and isinstance(obj.get("name"), str)
            and pages
            and isinstance(pages[0], dict)
            and "token" in pages[0]
        ):
            return obj
        for value in obj.values():
            found = _find_comic_detail(value)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_comic_detail(item)
            if found is not None:
                return found
    return None


def _normalize_comic_page(page: dict) -> dict:
    file_type = page.get("fileType")
    if not file_type or file_type is True or file_type is False:
        file_type = "jpg"
    return {
        "token": page.get("token"),
        "pageNumber": int(page.get("pageNumber") or 0),
        "fileType": str(file_type),
        "isAnimated": bool(page.get("isAnimated")),
        "widthPx": page.get("widthPx"),
        "heightPx": page.get("heightPx"),
        "description": page.get("description"),
        "thumbHash": page.get("thumbHash"),
    }


def _parse_tailspace_comic_detail(raw: bytes) -> dict:
    """Parse /c/{name}.data into { comic meta + pages }."""
    text = raw.decode("utf-8", errors="replace").strip()
    data = json.loads(text)
    comic = None
    if isinstance(data, dict):
        comic = _find_comic_detail(data)
    elif isinstance(data, list):
        comic = _find_comic_detail(_ts_decode_pool(data))
    if comic is None:
        raise ValueError("comic pages not found in response")
    pages = [
        _normalize_comic_page(p)
        for p in (comic.get("pages") or [])
        if isinstance(p, dict) and p.get("token")
    ]
    pages.sort(key=lambda p: p["pageNumber"])
    artist = comic.get("artist") if isinstance(comic.get("artist"), dict) else {}
    raw_comments = comic.get("comments") if isinstance(comic.get("comments"), list) else []
    comments = _normalize_comments(raw_comments)
    decoded = data
    if isinstance(data, list):
        decoded = _ts_decode_pool(data)
    route_stars = _find_key(decoded, "yourStars")
    route_bookmarked = _find_key(decoded, "isBookmarked")
    if route_bookmarked is None:
        route_bookmarked = _find_key(decoded, "bookmarked")
    your_stars = comic.get("yourStars")
    if not isinstance(your_stars, (int, float)):
        your_stars = route_stars if isinstance(route_stars, (int, float)) else None
    bookmarked = bool(
        comic.get("isBookmarked")
        if comic.get("isBookmarked") is not None
        else comic.get("bookmarked")
        if comic.get("bookmarked") is not None
        else route_bookmarked
        if route_bookmarked is not None
        else False
    )
    creator_user_id = artist.get("creatorUserId")
    return {
        "id": comic.get("id"),
        "name": comic.get("name"),
        "category": comic.get("category"),
        "state": comic.get("state"),
        "numberOfPages": int(comic.get("numberOfPages") or len(pages)),
        "description": comic.get("description"),
        "avgStars": comic.get("avgStars"),
        "yourStars": your_stars,
        "bookmarked": bookmarked,
        "commentCount": len(comments),
        "thumbnailVersion": comic.get("thumbnailVersion") or 0,
        "artistName": artist.get("name") or artist.get("creatorUsername") or "",
        "artistDisplayName": artist.get("name") or artist.get("creatorUsername") or "",
        "creatorUserId": creator_user_id if isinstance(creator_user_id, int) else None,
        "pages": pages,
        "comments": comments,
        "previousComic": (
            {"id": comic["previousComic"].get("id"), "name": comic["previousComic"].get("name")}
            if isinstance(comic.get("previousComic"), dict)
            else None
        ),
        "nextComic": (
            {"id": comic["nextComic"].get("id"), "name": comic["nextComic"].get("name")}
            if isinstance(comic.get("nextComic"), dict)
            else None
        ),
    }


def _normalize_tailspace_session(raw: str) -> str:
    """Normalize pasted cookie / raw session value to `tailspace_session=…`."""
    s = (raw or "").strip()
    if not s:
        return ""
    if re.search(r"tailspace_session\s*=", s, flags=re.I):
        for part in re.split(r";\s*", s):
            m = re.match(r"^tailspace_session\s*=\s*(.*)$", part.strip(), flags=re.I)
            if m:
                return f"tailspace_session={m.group(1).strip()}"
    if "=" in s and not re.match(r"^tailspace_session=", s, flags=re.I):
        # Full cookie header without our session — keep as-is
        return s
    return f"tailspace_session={s}"


def _decode_remix_payload(text: str) -> object | None:
    """Decode Remix single-fetch / turbo-stream text into a Python object."""
    trimmed = (text or "").strip()
    if not trimmed:
        return None
    for line in trimmed.split("\n"):
        chunk = line.strip()
        if not (chunk.startswith("[") or chunk.startswith("{")):
            continue
        try:
            parsed = json.loads(chunk)
        except json.JSONDecodeError:
            continue
        return _ts_decode_pool(parsed) if isinstance(parsed, list) else parsed
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        return None
    return _ts_decode_pool(parsed) if isinstance(parsed, list) else parsed


def _remix_action_data(decoded: object | None) -> dict:
    if not isinstance(decoded, dict):
        return {}
    data = decoded.get("data")
    if isinstance(data, dict):
        return data
    return decoded


def _extract_tailspace_session_cookie(set_cookies: list[str] | None) -> str | None:
    if not set_cookies:
        return None
    for line in set_cookies:
        first = (line or "").split(";", 1)[0].strip()
        m = re.match(r"^tailspace_session=(.*)$", first, flags=re.I)
        if m and m.group(1):
            return f"tailspace_session={m.group(1)}"
    return None


def _extract_tailspace_user(decoded: object | None) -> dict | None:
    user = _find_key(decoded, "user")
    if not isinstance(user, dict):
        return None
    username = str(user.get("username") or user.get("userName") or "").strip()
    if not username:
        return None
    user_id = user.get("userId")
    if not isinstance(user_id, int):
        raw_id = user.get("id")
        user_id = raw_id if isinstance(raw_id, int) else None
    return {"username": username, "userId": user_id}


def _normalize_tailspace_posts(payload: object) -> dict:
    """Unwrap {success,data:{posts,hasNextPage}} into a flat posts response."""
    if not isinstance(payload, dict):
        raise ValueError("posts payload is not an object")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(data, dict) or "posts" not in data:
        raise ValueError("posts payload missing posts array")
    return {
        "posts": data.get("posts") or [],
        "hasNextPage": bool(data.get("hasNextPage")),
    }


def _parse_weasyl_search_html(html_text: str) -> tuple[list[dict], int | None]:
    """Parse Weasyl /search HTML and return (submissions, nextid).

    Weasyl search result thumbnails follow a pattern like:
      <figure class="thumb">
        <a href="/~owner_login/submissions/123/slug">
          <img src="https://...thumbnail..." alt="Title">
        </a>
        ...
      </figure>
    Pagination nextid is found in an <a rel="next"> or link with nextid= param.
    """
    from html.parser import HTMLParser
    import html as html_module

    submissions: list[dict] = []
    page_nextid: int | None = None

    class _Parser(HTMLParser):
        def __init__(self):
            super().__init__()
            self._in_thumb = False
            self._thumb_depth = 0
            self._current: dict | None = None
            self._depth = 0

        def handle_starttag(self, tag, attrs):
            attr_map = dict(attrs)
            self._depth += 1

            # Detect <figure class="thumb ...">
            cls = attr_map.get("class", "")
            if tag == "figure" and "thumb" in cls.split():
                self._in_thumb = True
                self._thumb_depth = self._depth
                self._current = {}
                return

            if not self._in_thumb or self._current is None:
                # Also look for pagination link outside thumbs
                if tag == "a":
                    rel = attr_map.get("rel", "")
                    href = attr_map.get("href", "")
                    if rel == "next" and href and "nextid=" in href:
                        try:
                            nid_str = href.split("nextid=")[1].split("&")[0]
                            nonlocal page_nextid
                            page_nextid = int(nid_str)
                        except (ValueError, IndexError):
                            pass
                return

            if tag == "a" and "href" in attr_map:
                href = attr_map["href"]
                # Match /~owner_login/submissions/123 pattern
                import re as _re
                m = _re.search(r"/~([^/]+)/submissions/(\d+)", href)
                if m:
                    self._current["owner_login"] = m.group(1)
                    self._current["submitid"] = int(m.group(2))
                # Also catch pagination nextid from within-figure links
                if "nextid=" in href and "submitid" not in self._current:
                    try:
                        nid_str = href.split("nextid=")[1].split("&")[0]
                        page_nextid = int(nid_str)
                    except (ValueError, IndexError):
                        pass

            if tag == "img" and "src" in attr_map:
                src = attr_map["src"]
                # Only pick up thumbnail-sized images (skip avatars etc.)
                if "/thumbnail" in src or "/submit" in src or "weasyl.com" in src:
                    if "thumbnail" not in self._current:
                        self._current["thumbnail"] = src
                alt = attr_map.get("alt", "")
                if alt and "title" not in self._current:
                    self._current["title"] = html_module.unescape(alt)

            if tag == "span" or tag == "abbr":
                # Some Weasyl themes expose rating via class like "rating-general"
                for cls_part in attr_map.get("class", "").split():
                    if cls_part.startswith("rating-"):
                        self._current["rating"] = cls_part[len("rating-"):]

        def handle_endtag(self, tag):
            if self._in_thumb and self._depth == self._thumb_depth and tag == "figure":
                if self._current and "submitid" in self._current:
                    owner_login = self._current.get("owner_login", "")
                    thumb_url = self._current.get("thumbnail", "")
                    sub = {
                        "submitid": self._current["submitid"],
                        "title": self._current.get("title", ""),
                        "owner": self._current.get("owner_login", ""),
                        "owner_login": owner_login,
                        "posted_at": "",
                        "rating": self._current.get("rating", "general"),
                        "type": "submission",
                        "subtype": "visual",
                        "tags": [],
                        "media": {
                            "thumbnail": [{"mediaid": None, "url": thumb_url}] if thumb_url else [],
                        },
                    }
                    submissions.append(sub)
                self._in_thumb = False
                self._current = None
            self._depth -= 1

        def handle_data(self, data):
            pass

    parser = _Parser()
    parser.feed(html_text)

    # Also search for nextid in <a> tags with class "next-page" or rel="next"
    # in case the parser missed them — simple regex fallback
    import re
    if page_nextid is None:
        for m in re.finditer(r'[?&]nextid=(\d+)', html_text):
            # Take the last one (usually the "next page" link)
            try:
                page_nextid = int(m.group(1))
            except ValueError:
                pass

    return submissions, page_nextid


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        path = urlparse(self.path).path
        if path == "/" or path.endswith(".html") or ("." not in Path(path).name):
            self.send_header("Cache-Control", "no-cache")
        # SharedArrayBuffer for ffmpeg.wasm; credentialless keeps e621 CDN images working
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

    def _json(
        self,
        code: int,
        payload: dict,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        expected = _ensure_token()
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            got = auth[7:].strip()
            return secrets.compare_digest(got, expected)
        # Also accept X-Pull-Token for simpler clients.
        got = self.headers.get("X-Pull-Token", "").strip()
        return bool(got) and secrets.compare_digest(got, expected)

    def _site_base(self) -> str | None:
        raw = (self.headers.get("X-Site-Base") or "https://e621.net/").strip()
        if not raw.endswith("/"):
            raw += "/"
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or host not in FAVORITE_HOSTS:
            return None
        return f"https://{host}/"

    def _proxy_favorite(self, method: str, body: bytes, post_id: str | None = None) -> None:
        base = self._site_base()
        if not base:
            self._json(400, {"ok": False, "message": "invalid X-Site-Base"})
            return
        auth = self.headers.get("Authorization", "")
        if not auth.lower().startswith("basic "):
            self._json(401, {"ok": False, "message": "missing basic auth"})
            return
        if method == "POST":
            url = f"{base}favorites.json"
        elif method == "DELETE" and post_id:
            url = f"{base}favorites/{post_id}.json"
        else:
            self._json(404, {"ok": False, "message": "not found"})
            return
        req = urllib.request.Request(
            url,
            data=body if method == "POST" and body else None,
            method=method,
        )
        req.add_header("Authorization", auth)
        req.add_header("Accept", "application/json")
        req.add_header(
            "User-Agent",
            f"m-e621-favorites-proxy/1.0 (https://{DOMAIN}; same-origin favorites)",
        )
        if method == "POST":
            req.add_header(
                "Content-Type",
                self.headers.get("Content-Type") or "application/json",
            )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                payload = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            status = exc.code
            content_type = exc.headers.get("Content-Type", "application/json") if exc.headers else "application/json"
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": str(exc)})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_vote(self, body: bytes) -> None:
        base = self._site_base()
        if not base:
            self._json(400, {"ok": False, "message": "invalid X-Site-Base"})
            return
        auth = self.headers.get("Authorization", "")
        if not auth.lower().startswith("basic "):
            self._json(401, {"ok": False, "message": "missing basic auth"})
            return
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "message": "invalid json"})
            return
        post_id = payload.get("post_id")
        score = payload.get("score")
        if not isinstance(post_id, int) or score not in (1, -1, 0):
            self._json(400, {"ok": False, "message": "post_id and score required"})
            return
        url = f"{base}posts/{post_id}/votes.json"
        form = f"score={score}".encode("utf-8")
        req = urllib.request.Request(url, data=form, method="POST")
        req.add_header("Authorization", auth)
        req.add_header("Accept", "application/json")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header(
            "User-Agent",
            f"m-e621-votes-proxy/1.0 (https://{DOMAIN}; same-origin votes)",
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                resp_body = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as exc:
            resp_body = exc.read()
            status = exc.code
            content_type = (
                exc.headers.get("Content-Type", "application/json")
                if exc.headers
                else "application/json"
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": str(exc)})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(resp_body)))
        self.end_headers()
        self.wfile.write(resp_body)

    def _proxy_comment(self, body: bytes) -> None:
        base = self._site_base()
        if not base:
            self._json(400, {"ok": False, "message": "invalid X-Site-Base"})
            return
        auth = self.headers.get("Authorization", "")
        if not auth.lower().startswith("basic "):
            self._json(401, {"ok": False, "message": "missing basic auth"})
            return
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "message": "invalid json"})
            return
        post_id = payload.get("post_id")
        comment_body = payload.get("body")
        if not isinstance(post_id, int) or not isinstance(comment_body, str) or not comment_body.strip():
            self._json(400, {"ok": False, "message": "post_id and body required"})
            return
        url = f"{base}comments.json"
        form = urlencode(
            {
                "comment[post_id]": post_id,
                "comment[body]": comment_body,
            }
        ).encode("utf-8")
        req = urllib.request.Request(url, data=form, method="POST")
        req.add_header("Authorization", auth)
        req.add_header("Accept", "application/json")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header(
            "User-Agent",
            f"m-e621-comments-proxy/1.0 (https://{DOMAIN}; same-origin comments)",
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                resp_body = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as exc:
            resp_body = exc.read()
            status = exc.code
            content_type = (
                exc.headers.get("Content-Type", "application/json")
                if exc.headers
                else "application/json"
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": str(exc)})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(resp_body)))
        self.end_headers()
        self.wfile.write(resp_body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Authorization, Content-Type, X-Pull-Token, X-Site-Base, Range",
            )
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.end_headers()
            return
        self.send_error(404)

    def _allowed_media_url(self, raw: str) -> str | None:
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host:
            return None
        if host in FAVORITE_HOSTS or host.endswith(MEDIA_HOST_SUFFIXES):
            return parsed.geturl()
        if host in INKBUNNY_MEDIA_HOSTS or host.endswith(".metapix.net"):
            return parsed.geturl()
        if host in FURAFFINITY_MEDIA_HOSTS or host.endswith(FURAFFINITY_MEDIA_SUFFIXES):
            return parsed.geturl()
        if host in WEASYL_MEDIA_HOSTS:
            return parsed.geturl()
        return None

    def _allowed_fluffle_source_url(self, raw: str) -> str | None:
        """Allowlist for images forwarded to Fluffle (download allowlist + a few CDNs)."""
        allowed = self._allowed_media_url(raw)
        if allowed:
            return allowed
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host:
            return None
        if host in FLUFFLE_EXTRA_HOSTS or host.endswith(FLUFFLE_EXTRA_SUFFIXES):
            return parsed.geturl()
        if host == "tailspace.com" or host.endswith(".tailspace.com"):
            return parsed.geturl()
        return None

    def _guess_image_filename(self, url: str, content_type: str) -> tuple[str, str]:
        path = urlparse(url).path.lower()
        ctype = (content_type or "").split(";")[0].strip().lower()
        ext_map = {
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        for ext in ("jpg", "jpeg", "png", "webp", "gif"):
            if path.endswith("." + ext):
                name_ext = "jpg" if ext == "jpeg" else ext
                mime = {
                    "jpg": "image/jpeg",
                    "png": "image/png",
                    "webp": "image/webp",
                    "gif": "image/gif",
                }[name_ext]
                return f"image.{name_ext}", mime
        if ctype in ext_map:
            ext = ext_map[ctype]
            return f"image.{ext}", ctype if ctype != "image/jpg" else "image/jpeg"
        return "image.jpg", "image/jpeg"

    def _fetch_fluffle_source(self, url: str) -> tuple[bytes, str] | None:
        """Download image bytes for Fluffle; returns (bytes, content_type) or None on hard failure."""
        current = url
        for _ in range(5):
            req = urllib.request.Request(current, method="GET")
            req.add_header("User-Agent", f"m-e621-fluffle-proxy/1.0 (https://{DOMAIN})")
            req.add_header("Accept", "image/*,*/*")
            host = (urlparse(current).hostname or "").lower()
            if host in INKBUNNY_MEDIA_HOSTS or host.endswith(".metapix.net"):
                req.add_header("Referer", "https://inkbunny.net")
            if host in FURAFFINITY_MEDIA_HOSTS or host.endswith(FURAFFINITY_MEDIA_SUFFIXES):
                req.add_header("Referer", "https://www.furaffinity.net")
                parts = []
                a = os.environ.get("FA_COOKIE_A", "").strip()
                b = os.environ.get("FA_COOKIE_B", "").strip()
                if a:
                    parts.append(f"a={a}")
                if b:
                    parts.append(f"b={b}")
                if parts:
                    req.add_header("Cookie", "; ".join(parts))
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    final = resp.geturl() if hasattr(resp, "geturl") else current
                    if self._allowed_fluffle_source_url(final) is None:
                        return None
                    data = resp.read()
                    ctype = resp.headers.get("Content-Type", "application/octet-stream")
                    return data, ctype
            except urllib.error.HTTPError as exc:
                if exc.code in (301, 302, 303, 307, 308):
                    loc = exc.headers.get("Location")
                    if not loc:
                        return None
                    nxt = urljoin(current, loc)
                    if self._allowed_fluffle_source_url(nxt) is None:
                        return None
                    current = nxt
                    continue
                return None
            except Exception:
                return None
        return None

    def _encode_fluffle_multipart(
        self, file_bytes: bytes, filename: str, content_type: str, limit: int
    ) -> tuple[bytes, str]:
        boundary = f"----m-e621-fluffle-{secrets.token_hex(16)}"
        crlf = b"\r\n"
        chunks: list[bytes] = [
            f"--{boundary}".encode(),
            b'Content-Disposition: form-data; name="limit"',
            b"",
            str(limit).encode("utf-8"),
            f"--{boundary}".encode(),
            (
                f'Content-Disposition: form-data; name="file"; '
                f'filename="{filename}"'
            ).encode("utf-8"),
            f"Content-Type: {content_type}".encode("utf-8"),
            b"",
            file_bytes,
            f"--{boundary}--".encode(),
            b"",
        ]
        return crlf.join(chunks), f"multipart/form-data; boundary={boundary}"

    def _proxy_fluffle_exact_search(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "message": "invalid json"})
            return
        raw_url = (payload.get("url") or "").strip() if isinstance(payload, dict) else ""
        limit_raw = payload.get("limit", 8) if isinstance(payload, dict) else 8
        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            limit = 8
        limit = max(8, min(limit, 32))
        url = self._allowed_fluffle_source_url(raw_url)
        if not url:
            self._json(400, {"ok": False, "message": "url not allowed"})
            return
        fetched = self._fetch_fluffle_source(url)
        if not fetched:
            self._json(502, {"ok": False, "message": "failed to fetch image"})
            return
        file_bytes, src_ctype = fetched
        if not file_bytes:
            self._json(502, {"ok": False, "message": "empty image"})
            return
        # Fluffle hard limit is 4 MiB.
        if len(file_bytes) > 4 * 1024 * 1024:
            self._json(400, {"ok": False, "message": "image too large (max 4 MiB)"})
            return
        filename, mime = self._guess_image_filename(url, src_ctype)
        multipart, content_type = self._encode_fluffle_multipart(
            file_bytes, filename, mime, limit
        )
        req = urllib.request.Request(FLUFFLE_API, data=multipart, method="POST")
        req.add_header("User-Agent", FLUFFLE_UA)
        req.add_header("Accept", "application/json")
        req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                out = resp.read()
                status = getattr(resp, "status", 200)
                resp_ctype = resp.headers.get("Content-Type", "application/json")
                self.send_response(status)
                self.send_header("Content-Type", resp_ctype)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)
        except urllib.error.HTTPError as exc:
            err_body = exc.read() if exc.fp else b""
            self.send_response(exc.code)
            self.send_header(
                "Content-Type",
                exc.headers.get("Content-Type", "application/json")
                if exc.headers
                else "application/json",
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(err_body)))
            self.end_headers()
            if err_body:
                self.wfile.write(err_body)
        except Exception as exc:
            self._json(502, {"ok": False, "message": f"fluffle request failed: {exc}"})

    def _proxy_media(self, raw_url: str) -> None:
        url = self._allowed_media_url(raw_url)
        if not url:
            self._json(400, {"ok": False, "message": "url not allowed"})
            return
        range_header = self.headers.get("Range")
        # Follow redirects manually and re-check host each hop (M27).
        current = url
        for _ in range(5):
            req = urllib.request.Request(current, method="GET")
            req.add_header(
                "User-Agent",
                f"m-e621-download-proxy/1.0 (https://{DOMAIN})",
            )
            req.add_header("Accept", "*/*")
            if range_header:
                req.add_header("Range", range_header)
            host = (urlparse(current).hostname or "").lower()
            if host in INKBUNNY_MEDIA_HOSTS or host.endswith(".metapix.net"):
                req.add_header("Referer", "https://inkbunny.net")
            if host in FURAFFINITY_MEDIA_HOSTS or host.endswith(FURAFFINITY_MEDIA_SUFFIXES):
                req.add_header("Referer", "https://www.furaffinity.net")
                fa_cookies = (parse_qs(urlparse(self.path).query).get("fa") or [""])[0]
                if not fa_cookies:
                    parts = []
                    a = os.environ.get("FA_COOKIE_A", "").strip()
                    b = os.environ.get("FA_COOKIE_B", "").strip()
                    if a:
                        parts.append(f"a={a}")
                    if b:
                        parts.append(f"b={b}")
                    fa_cookies = "; ".join(parts)
                if fa_cookies:
                    req.add_header("Cookie", fa_cookies.replace(";", "; "))
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    final = resp.geturl() if hasattr(resp, "geturl") else current
                    if self._allowed_media_url(final) is None:
                        self._json(400, {"ok": False, "message": "redirect target not allowed"})
                        return
                    status = getattr(resp, "status", 200)
                    content_type = resp.headers.get("Content-Type", "application/octet-stream")
                    content_length = resp.headers.get("Content-Length")
                    content_range = resp.headers.get("Content-Range")
                    accept_ranges = resp.headers.get("Accept-Ranges") or "bytes"
                    self.send_response(status)
                    self.send_header("Content-Type", content_type)
                    if content_length:
                        self.send_header("Content-Length", content_length)
                    if content_range:
                        self.send_header("Content-Range", content_range)
                    self.send_header("Accept-Ranges", accept_ranges)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    # Allow embedding under COEP pages (Firefox media ORB).
                    self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
                    self.send_header("Cache-Control", "private, max-age=3600")
                    self.end_headers()
                    while True:
                        chunk = resp.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                    return
            except urllib.error.HTTPError as exc:
                if exc.code in (301, 302, 303, 307, 308):
                    loc = exc.headers.get("Location")
                    if not loc:
                        self._json(exc.code, {"ok": False, "message": "redirect without Location"})
                        return
                    nxt = urljoin(current, loc)
                    if self._allowed_media_url(nxt) is None:
                        self._json(400, {"ok": False, "message": "redirect target not allowed"})
                        return
                    current = nxt
                    continue
                # Some stacks surface 206 via HTTPError; stream that body too.
                if exc.code == 206:
                    content_type = (
                        exc.headers.get("Content-Type", "application/octet-stream")
                        if exc.headers
                        else "application/octet-stream"
                    )
                    content_length = exc.headers.get("Content-Length") if exc.headers else None
                    content_range = exc.headers.get("Content-Range") if exc.headers else None
                    self.send_response(206)
                    self.send_header("Content-Type", content_type)
                    if content_length:
                        self.send_header("Content-Length", content_length)
                    if content_range:
                        self.send_header("Content-Range", content_range)
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
                    self.send_header("Cache-Control", "private, max-age=3600")
                    self.end_headers()
                    while True:
                        chunk = exc.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                    return
                self._json(exc.code, {"ok": False, "message": str(exc.reason)})
                return
            except Exception as exc:  # noqa: BLE001
                self._json(502, {"ok": False, "message": str(exc)})
                return
        self._json(502, {"ok": False, "message": "too many redirects"})

    def _tailspace_session(self) -> str:
        raw = (self.headers.get(TAILSPACE_SESSION_HEADER) or "").strip()
        return _normalize_tailspace_session(raw)

    def _tailspace_request(
        self,
        url: str,
        *,
        accept: str = "application/json, */*",
        timeout: int = 30,
        method: str = "GET",
        body: bytes | None = None,
        cookie: str | None = None,
        content_type: str | None = None,
        referer: str | None = None,
    ) -> tuple[bytes, int, str, list[str]]:
        """Fetch a Tailspace URL and return (body, status, content_type, set_cookie_lines)."""
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Accept", accept)
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        req.add_header(
            "User-Agent",
            f"me621-tailspace-proxy/1.0 (https://{DOMAIN}; browser proxy)",
        )
        req.add_header("Referer", referer or (TAILSPACE_BASE + "/"))
        req.add_header("Origin", TAILSPACE_BASE)
        if content_type:
            req.add_header("Content-Type", content_type)
        if cookie:
            req.add_header("Cookie", cookie)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                resp_body = resp.read()
                status = getattr(resp, "status", 200)
                ct = resp.headers.get("Content-Type", "application/json")
                set_cookies = resp.headers.get_all("Set-Cookie") or []
            return resp_body, status, ct, set_cookies
        except urllib.error.HTTPError as exc:
            set_cookies = exc.headers.get_all("Set-Cookie") if exc.headers else []
            return exc.read(), exc.code, "application/json", set_cookies or []

    def _tailspace_get(
        self,
        url: str,
        *,
        accept: str = "application/json, */*",
        cookie: str | None = None,
        fallback_without_cookie: bool = True,
    ) -> tuple[bytes, int, str, bool]:
        """GET Tailspace URL; on session-induced 500, retry anonymously once."""
        body, status, ct, _sc = self._tailspace_request(url, accept=accept, cookie=cookie)
        rejected = False
        if fallback_without_cookie and cookie and status == 500:
            body2, status2, ct2, _sc2 = self._tailspace_request(
                url, accept=accept, cookie=None
            )
            if status2 == 200:
                return body2, status2, ct2, True
        return body, status, ct, rejected

    @staticmethod
    def _session_rejected_headers(rejected: bool) -> dict[str, str] | None:
        if not rejected:
            return None
        return {"X-Tailspace-Session-Rejected": "1"}

    def _proxy_tailspace_posts(self, parsed) -> None:
        params = parse_qs(parsed.query)
        page = (params.get("page") or ["1"])[0]
        try:
            page_n = max(1, int(page))
        except ValueError:
            page_n = 1
        url = f"{TAILSPACE_BASE}/api/get-browse-posts-paginated?page={page_n}"
        body, status, _ct, rejected = self._tailspace_get(
            url, cookie=self._tailspace_session() or None
        )
        if status == 200:
            try:
                data = _normalize_tailspace_posts(json.loads(body))
                self._json(200, data, self._session_rejected_headers(rejected))
                return
            except (json.JSONDecodeError, ValueError) as exc:
                self._json(502, {"ok": False, "message": f"upstream JSON parse error: {exc}"})
                return
        self._json(status, {"ok": False, "message": f"upstream returned {status}"})

    def _proxy_tailspace_comics(self, parsed) -> None:
        params = parse_qs(parsed.query)

        # Forward whitelisted query params
        fwd: list[tuple[str, str]] = []
        for key in ("page", "search", "sort", "finishedOnly"):
            for v in params.get(key, []):
                fwd.append((key, v))
        for v in params.get("c", []):
            fwd.append(("c", v))
        for v in params.get("tag", []):
            fwd.append(("tag", v))
        for v in params.get("excludeTag", []):
            fwd.append(("excludeTag", v))

        qs = urlencode(fwd)
        url = f"{TAILSPACE_BASE}/browse.data" + (f"?{qs}" if qs else "")
        body, status, _ct, rejected = self._tailspace_get(
            url,
            accept="text/x-turbo-stream, application/json, */*",
            cookie=self._tailspace_session() or None,
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            data = _parse_tailspace_comics_response(body)
            self._json(200, data, self._session_rejected_headers(rejected))
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"parse error: {exc}"})

    def _proxy_tailspace_comic(self, parsed) -> None:
        params = parse_qs(parsed.query)
        name = (params.get("name") or [""])[0].strip()
        if not name:
            self._json(400, {"ok": False, "message": "name required"})
            return

        url = f"{TAILSPACE_BASE}/c/{quote(name, safe='')}.data"
        body, status, _ct, rejected = self._tailspace_get(
            url,
            accept="text/x-turbo-stream, application/json, */*",
            cookie=self._tailspace_session() or None,
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            data = _parse_tailspace_comic_detail(body)
            self._json(200, data, self._session_rejected_headers(rejected))
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"parse error: {exc}"})

    def _proxy_tailspace_comments(self, parsed) -> None:
        params = parse_qs(parsed.query)
        username = (params.get("username") or [""])[0].strip()
        post_id = (params.get("postId") or [""])[0].strip()
        if not username or not post_id.isdigit():
            self._json(400, {"ok": False, "message": "username and postId required"})
            return
        # Basic path-segment safety
        if "/" in username or ".." in username:
            self._json(400, {"ok": False, "message": "invalid username"})
            return
        url = f"{TAILSPACE_BASE}/artist/{quote(username, safe='')}/post/{post_id}.data"
        body, status, _ct, rejected = self._tailspace_get(
            url,
            accept="text/x-turbo-stream, application/json, */*",
            cookie=self._tailspace_session() or None,
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            comments = _parse_tailspace_post_comments(body)
            self._json(200, {"comments": comments}, self._session_rejected_headers(rejected))
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"parse error: {exc}"})


    def _tailspace_remix_action(self, path: str, fields: dict, cookie: str = "") -> tuple[bytes, int, list[str]]:
        body = urlencode(fields).encode("utf-8")
        raw, status, _ct, set_cookies = self._tailspace_request(
            f"{TAILSPACE_BASE}{path}",
            method="POST",
            body=body,
            cookie=cookie or None,
            accept="text/x-script",
            content_type="application/x-www-form-urlencoded;charset=UTF-8",
        )
        return raw, status, set_cookies

    def _tailspace_fetch_me(self, cookie: str) -> dict | None:
        raw, status, _ct, _sc = self._tailspace_request(
            f"{TAILSPACE_BASE}/browse-feed.data",
            accept="text/x-script",
            cookie=cookie,
            referer=f"{TAILSPACE_BASE}/browse-feed",
        )
        text = raw.decode("utf-8", errors="replace")
        if '"redirect"' in text and "/login" in text:
            return None
        decoded = _decode_remix_payload(text)
        user = _extract_tailspace_user(decoded)
        if user:
            return user
        logged_in = _find_key(decoded, "isLoggedIn")
        username = _find_key(decoded, "username")
        if logged_in is True and isinstance(username, str) and username.strip():
            return {"username": username.strip(), "userId": None}
        return None

    def _proxy_tailspace_feed(self, parsed) -> None:
        cookie = self._tailspace_session()
        if not cookie:
            self._json(401, {"ok": False, "message": "Tailspace login required"})
            return
        params = parse_qs(parsed.query)
        try:
            page_n = max(1, int((params.get("page") or ["1"])[0]))
        except ValueError:
            page_n = 1
        url = f"{TAILSPACE_BASE}/api/get-feed-paginated?page={page_n}"
        body, status, _ct, _sc = self._tailspace_request(url, cookie=cookie)
        if status != 200:
            if status == 500:
                self._json(
                    401,
                    {"ok": False, "message": "Tailspace session expired — sign in again"},
                    self._session_rejected_headers(True),
                )
            else:
                self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            decoded = _decode_remix_payload(body.decode("utf-8", errors="replace"))
            payload = decoded if isinstance(decoded, dict) else {}
        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        if not isinstance(data, dict):
            data = {}
        self._json(
            200,
            {
                "posts": data.get("posts") or [],
                "hasNextPage": bool(data.get("hasNextPage") or data.get("hasMorePosts")),
            },
        )

    def _proxy_tailspace_auth_post(self, path: str, body: bytes) -> None:
        try:
            self._proxy_tailspace_auth_post_inner(path, body)
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": str(exc)})

    def _proxy_tailspace_auth_post_inner(self, path: str, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8") or "{}") if body else {}
            if not isinstance(payload, dict):
                raise ValueError("object required")
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self._json(400, {"ok": False, "message": f"invalid json: {exc}"})
            return

        cookie_body = _normalize_tailspace_session(str(payload.get("cookies") or ""))
        cookie = cookie_body or self._tailspace_session()

        if path == "/api/tailspace/login":
            username = str(payload.get("username") or "").strip()
            password = str(payload.get("password") or "")
            if not username or not password:
                self._json(400, {"ok": False, "message": "username and password required"})
                return
            raw, _status, set_cookies = self._tailspace_remix_action(
                "/login.data",
                {
                    "username": username,
                    "password": password,
                    "redirect": str(payload.get("redirect") or ""),
                },
            )
            data = _remix_action_data(_decode_remix_payload(raw.decode("utf-8", errors="replace")))
            if data.get("success") is False or data.get("error"):
                self._json(401, {"ok": False, "message": str(data.get("error") or "Login failed")})
                return
            session = _extract_tailspace_session_cookie(set_cookies)
            if not session:
                self._json(
                    401,
                    {"ok": False, "message": "Login did not return a session cookie (captcha or blocked?)"},
                )
                return
            me = self._tailspace_fetch_me(session)
            if not me:
                self._json(401, {"ok": False, "message": "Session could not be verified"})
                return
            self._json(200, {"ok": True, "username": me["username"], "userId": me.get("userId"), "cookies": session})
            return

        if path == "/api/tailspace/login-cookies":
            session = _normalize_tailspace_session(
                str(payload.get("cookies") or payload.get("cookie") or payload.get("session") or "")
            )
            if not session:
                self._json(400, {"ok": False, "message": "cookies required"})
                return
            me = self._tailspace_fetch_me(session)
            if not me:
                self._json(401, {"ok": False, "message": "Invalid or expired Tailspace session cookie"})
                return
            self._json(200, {"ok": True, "username": me["username"], "userId": me.get("userId"), "cookies": session})
            return

        if path == "/api/tailspace/me":
            if not cookie:
                self._json(401, {"ok": False, "message": "not logged in"})
                return
            me = self._tailspace_fetch_me(cookie)
            if not me:
                self._json(401, {"ok": False, "message": "Invalid or expired Tailspace session"})
                return
            self._json(200, {"ok": True, **me, "cookies": cookie})
            return

        if path == "/api/tailspace/logout":
            if cookie:
                self._tailspace_remix_action("/logout.data", {}, cookie)
            self._json(200, {"ok": True})
            return

        if not cookie:
            self._json(401, {"ok": False, "message": "Tailspace login required"})
            return

        if path == "/api/tailspace/like":
            post_id = str(payload.get("postId") or "")
            if not post_id.isdigit():
                self._json(400, {"ok": False, "message": "postId required"})
                return
            raw, _status, _sc = self._tailspace_remix_action(
                "/api/post-toggle-like.data", {"postId": post_id}, cookie
            )
            data = _remix_action_data(_decode_remix_payload(raw.decode("utf-8", errors="replace")))
            if data.get("error"):
                self._json(400, {"ok": False, "message": str(data.get("error"))})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "liked": bool(data.get("liked")),
                    "likeCount": int(data.get("likeCount") or 0),
                },
            )
            return

        if path == "/api/tailspace/star":
            comic_id = str(payload.get("comicId") or "")
            stars = str(payload.get("stars") or "")
            if not comic_id.isdigit() or not stars.isdigit():
                self._json(400, {"ok": False, "message": "comicId and stars required"})
                return
            raw, _status, _sc = self._tailspace_remix_action(
                "/api/update-your-stars.data",
                {"comicId": comic_id, "stars": stars},
                cookie,
            )
            data = _remix_action_data(_decode_remix_payload(raw.decode("utf-8", errors="replace")))
            if data.get("error"):
                self._json(400, {"ok": False, "message": str(data.get("error"))})
                return
            self._json(200, {"ok": True, "stars": int(stars), "data": data})
            return

        if path == "/api/tailspace/comment":
            comment = str(payload.get("comment") or "").strip()
            post_id = str(payload.get("postId") or "")
            comic_id = str(payload.get("comicId") or "")
            if not comment:
                self._json(400, {"ok": False, "message": "comment required"})
                return
            if post_id.isdigit():
                raw, _status, _sc = self._tailspace_remix_action(
                    "/api/post-add-comment.data",
                    {"postId": post_id, "comment": comment},
                    cookie,
                )
            elif comic_id.isdigit():
                raw, _status, _sc = self._tailspace_remix_action(
                    "/api/add-comment.data",
                    {"comicId": comic_id, "comment": comment},
                    cookie,
                )
            else:
                self._json(400, {"ok": False, "message": "postId or comicId required"})
                return
            data = _remix_action_data(_decode_remix_payload(raw.decode("utf-8", errors="replace")))
            if data.get("error") or data.get("success") is False:
                self._json(400, {"ok": False, "message": str(data.get("error") or "Comment failed")})
                return
            self._json(200, {"ok": True, "data": data})
            return

        if path == "/api/tailspace/follow":
            creator_user_id = str(payload.get("creatorUserId") or "")
            action = str(payload.get("action") or "").lower()
            if not creator_user_id.isdigit() or action not in ("follow", "unfollow"):
                self._json(
                    400,
                    {"ok": False, "message": "creatorUserId and action=follow|unfollow required"},
                )
                return
            raw, _status, _sc = self._tailspace_remix_action(
                "/api/follow-artist.data",
                {"creatorUserId": creator_user_id, "action": action},
                cookie,
            )
            data = _remix_action_data(_decode_remix_payload(raw.decode("utf-8", errors="replace")))
            if data.get("error") or data.get("success") is False:
                self._json(400, {"ok": False, "message": str(data.get("error") or "Follow failed")})
                return
            self._json(200, {"ok": True, "following": action == "follow", "data": data})
            return

        self._json(404, {"ok": False, "message": "not found"})

    # ------------------------------------------------------------------
    # Weasyl proxy helpers
    # ------------------------------------------------------------------

    def _weasyl_api_request(
        self,
        url: str,
        *,
        api_key: str | None = None,
        timeout: int = 30,
    ) -> tuple[bytes, int, str]:
        """Make a JSON API request to Weasyl and return (body, status, content_type)."""
        req = urllib.request.Request(url, method="GET")
        req.add_header("Accept", "application/json")
        req.add_header(
            "User-Agent",
            f"me621-weasyl-proxy/1.0 (https://{DOMAIN}; browser proxy)",
        )
        if api_key:
            req.add_header("X-Weasyl-API-Key", api_key)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                status = getattr(resp, "status", 200)
                ct = resp.headers.get("Content-Type", "application/json")
            return data, status, ct
        except urllib.error.HTTPError as exc:
            return exc.read(), exc.code, "application/json"
        except Exception as exc:  # noqa: BLE001
            return (
                json.dumps({"error": {"name": str(exc)}}).encode(),
                502,
                "application/json",
            )

    def _weasyl_respond(self, body: bytes, status: int, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _weasyl_api_key(self, parsed) -> str | None:
        """Extract API key from the `key` query param."""
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        return key or None

    def _proxy_weasyl_frontpage(self, parsed) -> None:
        """GET /api/weasyl/frontpage → Weasyl /api/submissions/frontpage"""
        params = parse_qs(parsed.query)
        api_key = self._weasyl_api_key(parsed)
        count = (params.get("count") or ["75"])[0]
        since = (params.get("since") or [""])[0]
        qs_parts = [f"count={count}"]
        if since:
            qs_parts.append(f"since={quote(since)}")
        url = f"{WEASYL_API_BASE}/api/submissions/frontpage?{'&'.join(qs_parts)}"
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_submission(self, submitid: str, parsed) -> None:
        """GET /api/weasyl/submission/<id> → Weasyl /api/submissions/<id>/view"""
        api_key = self._weasyl_api_key(parsed)
        url = f"{WEASYL_API_BASE}/api/submissions/{submitid}/view?anyway=1"
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_gallery(self, login: str, parsed) -> None:
        """GET /api/weasyl/gallery/<login> → Weasyl /api/users/<login>/gallery"""
        params = parse_qs(parsed.query)
        api_key = self._weasyl_api_key(parsed)
        qs_parts = []
        for key in ("count", "nextid", "backid", "folderid", "since"):
            val = (params.get(key) or [""])[0]
            if val:
                qs_parts.append(f"{key}={quote(val)}")
        qs = "&".join(qs_parts)
        url = f"{WEASYL_API_BASE}/api/users/{login}/gallery" + (f"?{qs}" if qs else "")
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_favorites(self, login: str, parsed) -> None:
        """GET /api/weasyl/favorites/<login> → Weasyl /api/users/<login>/gallery (favorites tab)

        Weasyl does not expose a favorites API endpoint in v1.2; we use the gallery
        endpoint filtered to favorites as a best-effort fallback.
        """
        params = parse_qs(parsed.query)
        api_key = self._weasyl_api_key(parsed)
        qs_parts = []
        for key in ("count", "nextid", "backid"):
            val = (params.get(key) or [""])[0]
            if val:
                qs_parts.append(f"{key}={quote(val)}")
        qs = "&".join(qs_parts)
        # Try the gallery endpoint; if Weasyl adds a /favorites endpoint in future
        # this is the place to switch the URL.
        url = f"{WEASYL_API_BASE}/api/users/{login}/gallery" + (f"?{qs}" if qs else "")
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_user(self, login: str, parsed) -> None:
        """GET /api/weasyl/user/<login> → Weasyl /api/users/<login>/view"""
        api_key = self._weasyl_api_key(parsed)
        url = f"{WEASYL_API_BASE}/api/users/{login}/view"
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_whoami(self, parsed) -> None:
        """GET /api/weasyl/whoami → Weasyl /api/whoami (API key verification)"""
        api_key = self._weasyl_api_key(parsed)
        if not api_key:
            err = json.dumps({"error": {"name": "Unauthorized"}}).encode()
            self._weasyl_respond(err, 401, "application/json")
            return
        url = f"{WEASYL_API_BASE}/api/whoami"
        body, status, ct = self._weasyl_api_request(url, api_key=api_key)
        self._weasyl_respond(body, status, ct)

    def _proxy_weasyl_search(self, parsed) -> None:
        """GET /api/weasyl/search → scrape Weasyl /search HTML → return JSON.

        Weasyl has no public JSON search API; this method fetches the HTML search
        page and parses submission stubs out of it using stdlib html.parser.
        Returns: {"submissions": [...], "nextid": <int or null>}
        """
        import html
        from html.parser import HTMLParser

        params = parse_qs(parsed.query)
        api_key = self._weasyl_api_key(parsed)
        q = (params.get("q") or [""])[0].strip()
        nextid = (params.get("nextid") or [""])[0].strip()
        count = (params.get("count") or [""])[0].strip()
        orderby = (params.get("orderby") or [""])[0].strip()

        if not q:
            # Fall back to frontpage when called with no query
            self._proxy_weasyl_frontpage(parsed)
            return

        qs_parts = [f"q={quote(q)}", "find=submit"]
        if nextid:
            qs_parts.append(f"nextid={nextid}")
        if orderby == "popular":
            qs_parts.append("orderby=faves")
        scrape_url = f"{WEASYL_API_BASE}/search?{'&'.join(qs_parts)}"

        req = urllib.request.Request(scrape_url, method="GET")
        req.add_header("Accept", "text/html,application/xhtml+xml,*/*")
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        req.add_header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36 me621-weasyl-proxy/1.0",
        )
        if api_key:
            req.add_header("X-Weasyl-API-Key", api_key)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw_bytes = resp.read()
        except urllib.error.HTTPError as exc:
            err = json.dumps({"ok": False, "message": f"Weasyl search error: {exc.code}"}).encode()
            self._weasyl_respond(err, exc.code, "application/json")
            return
        except Exception as exc:  # noqa: BLE001
            err = json.dumps({"ok": False, "message": str(exc)}).encode()
            self._weasyl_respond(err, 502, "application/json")
            return

        raw_html = raw_bytes.decode("utf-8", errors="replace")
        submissions, page_nextid = _parse_weasyl_search_html(raw_html)

        result = json.dumps({"submissions": submissions, "nextid": page_nextid}).encode()
        self._weasyl_respond(result, 200, "application/json")

    # ------------------------------------------------------------------
    # Furbooru proxy helpers
    # ------------------------------------------------------------------

    def _furbooru_request(
        self,
        url: str,
        *,
        method: str = "GET",
        body: bytes = b"",
        content_type: str = "application/json",
        timeout: int = 30,
    ) -> tuple[bytes, int, str]:
        """Make a request to Furbooru and return (body, status, content_type)."""
        req = urllib.request.Request(url, method=method)
        req.add_header("Accept", "application/json")
        req.add_header(
            "User-Agent",
            f"me621-furbooru-proxy/1.0 (https://{DOMAIN}; browser proxy)",
        )
        if body:
            req.add_header("Content-Type", content_type)
            req.data = body
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                status = getattr(resp, "status", 200)
                ct = resp.headers.get("Content-Type", "application/json")
            return data, status, ct
        except urllib.error.HTTPError as exc:
            return exc.read(), exc.code, "application/json"
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"ok": False, "message": str(exc)}).encode(), 502, "application/json"

    def _furbooru_respond(self, data: bytes, status: int, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _proxy_furbooru_images(self, parsed) -> None:
        """GET /api/furbooru/images → /api/v1/json/search/images"""
        params = parse_qs(parsed.query)

        def _first(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        fwd = {}
        for key in ("q", "page", "per_page", "key", "sf", "sd"):
            v = _first(key)
            if v is not None:
                fwd[key] = v
        url = f"{FURBOORU_BASE}/api/v1/json/search/images?{urlencode(fwd)}"
        body, status, ct = self._furbooru_request(url)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_tags(self, parsed) -> None:
        """GET /api/furbooru/tags → /api/v1/json/search/tags"""
        params = parse_qs(parsed.query)

        def _first(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        fwd = {}
        for key in ("q", "per_page", "key"):
            v = _first(key)
            if v is not None:
                fwd[key] = v
        url = f"{FURBOORU_BASE}/api/v1/json/search/tags?{urlencode(fwd)}"
        body, status, ct = self._furbooru_request(url)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_comments_get(self, parsed) -> None:
        """GET /api/furbooru/comments → /api/v1/json/search/comments

        Philomena expects q=image_id:N (not image_id= as a query param).
        /comments/search is not a valid path and returns 400.
        """
        params = parse_qs(parsed.query)

        def _first(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        fwd: dict[str, str] = {}
        q = _first("q")
        image_id = _first("image_id")
        if q:
            fwd["q"] = q
        elif image_id:
            fwd["q"] = f"image_id:{image_id}"
        for key in ("per_page", "key", "page", "sf", "sd"):
            v = _first(key)
            if v is not None:
                fwd[key] = v
        url = f"{FURBOORU_BASE}/api/v1/json/search/comments?{urlencode(fwd)}"
        body, status, ct = self._furbooru_request(url)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_user(self, parsed) -> None:
        """GET /api/furbooru/user?key=... → /api/v1/json/filters/user

        Philomena has no /users/me. /filters/user returns 200 with a valid
        key and 403 without one / with a bad key — used for credential verify.
        """
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        if not key:
            self._json(400, {"ok": False, "message": "key required"})
            return
        url = f"{FURBOORU_BASE}/api/v1/json/filters/user?key={quote(key)}"
        body, status, ct = self._furbooru_request(url)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_faves(self, method: str, image_id: str, parsed) -> None:
        """POST/DELETE /api/furbooru/images/:id/faves"""
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        url = f"{FURBOORU_BASE}/api/v1/json/images/{image_id}/faves?key={quote(key)}"
        body, status, ct = self._furbooru_request(url, method=method)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_votes(self, image_id: str, parsed, method: str = "POST") -> None:
        """POST/DELETE /api/furbooru/images/:id/votes"""
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        if method == "DELETE":
            url = f"{FURBOORU_BASE}/api/v1/json/images/{image_id}/votes?key={quote(key)}"
        else:
            value = (params.get("value") or ["up"])[0]
            url = f"{FURBOORU_BASE}/api/v1/json/images/{image_id}/votes?key={quote(key)}&value={quote(value)}"
        body, status, ct = self._furbooru_request(url, method=method)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_comments_post(self, parsed, body: bytes) -> None:
        """POST /api/furbooru/comments"""
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        url = f"{FURBOORU_BASE}/api/v1/json/comments?key={quote(key)}"
        resp_body, status, ct = self._furbooru_request(
            url, method="POST", body=body, content_type="application/json"
        )
        self._furbooru_respond(resp_body, status, ct)

    def _inkbunny_request(
        self,
        url: str,
        *,
        method: str = "GET",
        body: bytes = b"",
        content_type: str = "application/x-www-form-urlencoded",
        timeout: int = 30,
    ) -> tuple[bytes, int, str]:
        req = urllib.request.Request(url, method=method)
        req.add_header("Accept", "application/json")
        req.add_header(
            "User-Agent",
            f"me621-inkbunny-proxy/1.0 (https://{DOMAIN}; browser proxy)",
        )
        if body:
            req.add_header("Content-Type", content_type)
            req.data = body
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                status = getattr(resp, "status", 200)
                ct = resp.headers.get("Content-Type", "application/json")
            return data, status, ct
        except urllib.error.HTTPError as exc:
            return exc.read(), exc.code, "application/json"
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"ok": False, "message": str(exc)}).encode(), 502, "application/json"

    def _proxy_inkbunny_post(self, php_script: str, body: bytes, content_type: str) -> None:
        url = f"{INKBUNNY_BASE}/{php_script}"
        data, status, ct = self._inkbunny_request(
            url,
            method="POST",
            body=body,
            content_type=content_type or "application/x-www-form-urlencoded",
        )
        self.send_response(status)
        self.send_header("Content-Type", ct)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _proxy_inkbunny_keywords(self, parsed) -> None:
        params = parse_qs(parsed.query)
        fwd = {}
        for key in ("keyword", "ratingsmask", "underscorespaces"):
            vals = params.get(key)
            if vals:
                fwd[key] = vals[0]
        url = f"{INKBUNNY_BASE}/api_search_autosuggest.php?{urlencode(fwd)}"
        data, status, ct = self._inkbunny_request(url)
        self.send_response(status)
        self.send_header("Content-Type", ct)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _proxy_furaffinity(self, action: str, body: bytes) -> None:
        try:
            import fa_proxy
        except ImportError as exc:
            self._json(
                501,
                {
                    "ok": False,
                    "message": (
                        "FurAffinity support needs faapi. "
                        "From the app directory: uv venv .venv && uv pip install -r requirements.txt "
                        f"({exc})"
                    ),
                },
            )
            return
        try:
            payload = json.loads(body.decode("utf-8") or "{}") if body else {}
            if not isinstance(payload, dict):
                raise ValueError("object required")
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self._json(400, {"ok": False, "message": f"invalid json: {exc}"})
            return
        status, result = fa_proxy.handle(action, payload)
        self._json(status, result)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/download":
            raw = (parse_qs(parsed.query).get("url") or [""])[0]
            self._proxy_media(raw)
            return
        if path == "/api/git":
            self._json(
                200,
                {
                    **_state,
                    "head": _git_head(),
                    "branch": BRANCH,
                    "pull_enabled": True,
                },
            )
            return
        if TAILSPACE_POSTS_PATH.match(path):
            self._proxy_tailspace_posts(parsed)
            return
        if TAILSPACE_COMIC_PATH.match(path):
            self._proxy_tailspace_comic(parsed)
            return
        if TAILSPACE_COMICS_PATH.match(path):
            self._proxy_tailspace_comics(parsed)
            return
        if TAILSPACE_COMMENTS_PATH.match(path):
            self._proxy_tailspace_comments(parsed)
            return
        if TAILSPACE_FEED_PATH.match(path):
            self._proxy_tailspace_feed(parsed)
            return
        if FURBOORU_IMAGES_PATH.match(path):
            self._proxy_furbooru_images(parsed)
            return
        if FURBOORU_TAGS_PATH.match(path):
            self._proxy_furbooru_tags(parsed)
            return
        if FURBOORU_COMMENTS_GET_PATH.match(path):
            self._proxy_furbooru_comments_get(parsed)
            return
        if FURBOORU_USER_PATH.match(path):
            self._proxy_furbooru_user(parsed)
            return
        if INKBUNNY_KEYWORDS_PATH.match(path):
            self._proxy_inkbunny_keywords(parsed)
            return
        if WEASYL_FRONTPAGE_PATH.match(path):
            self._proxy_weasyl_frontpage(parsed)
            return
        if WEASYL_SEARCH_PATH.match(path):
            self._proxy_weasyl_search(parsed)
            return
        weasyl_sub = WEASYL_SUBMISSION_PATH.match(path)
        if weasyl_sub:
            self._proxy_weasyl_submission(weasyl_sub.group(1), parsed)
            return
        weasyl_gallery = WEASYL_GALLERY_PATH.match(path)
        if weasyl_gallery:
            self._proxy_weasyl_gallery(weasyl_gallery.group(1), parsed)
            return
        weasyl_faves = WEASYL_FAVORITES_PATH.match(path)
        if weasyl_faves:
            self._proxy_weasyl_favorites(weasyl_faves.group(1), parsed)
            return
        weasyl_user = WEASYL_USER_PATH.match(path)
        if weasyl_user:
            self._proxy_weasyl_user(weasyl_user.group(1), parsed)
            return
        if WEASYL_WHOAMI_PATH.match(path):
            self._proxy_weasyl_whoami(parsed)
            return
        if path.startswith("/api/"):
            self._json(404, {"ok": False, "message": "not found"})
            return

        rel = path.lstrip("/")
        candidate = (ROOT / rel).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            self.send_error(403)
            return
        if rel and not candidate.exists():
            self.path = "/index.html"
        elif candidate.is_dir():
            if not (candidate / "index.html").exists():
                self.path = "/index.html"
        return super().do_GET()

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        match = FAVORITE_PATH.match(path)
        if match and match.group(1):
            self._proxy_favorite("DELETE", b"", match.group(1))
            return
        fav_match = FURBOORU_FAVES_PATH.match(path)
        if fav_match:
            self._proxy_furbooru_faves("DELETE", fav_match.group(1), parsed)
            return
        vote_match = FURBOORU_VOTES_PATH.match(path)
        if vote_match:
            self._proxy_furbooru_votes(vote_match.group(1), parsed, method="DELETE")
            return
        self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""

        if path == FLUFFLE_PATH:
            self._proxy_fluffle_exact_search(body)
            return

        if path == "/api/favorites":
            self._proxy_favorite("POST", body)
            return

        if VOTES_PATH.match(path):
            self._proxy_vote(body)
            return

        if COMMENTS_PATH.match(path):
            self._proxy_comment(body)
            return

        fav_match = FURBOORU_FAVES_PATH.match(path)
        if fav_match:
            self._proxy_furbooru_faves("POST", fav_match.group(1), parsed)
            return

        vote_match = FURBOORU_VOTES_PATH.match(path)
        if vote_match:
            self._proxy_furbooru_votes(vote_match.group(1), parsed, method="POST")
            return

        if FURBOORU_COMMENTS_POST_PATH.match(path):
            self._proxy_furbooru_comments_post(parsed, body)
            return

        php = INKBUNNY_POST_ROUTES.get(path)
        if php:
            content_type = self.headers.get(
                "Content-Type", "application/x-www-form-urlencoded"
            )
            self._proxy_inkbunny_post(php, body, content_type)
            return

        fa_match = FURAFFINITY_PATH.match(path)
        if fa_match:
            self._proxy_furaffinity(fa_match.group(1), body)
            return

        if path in TAILSPACE_AUTH_POSTS:
            self._proxy_tailspace_auth_post(path, body)
            return

        if path != "/api/git/pull":
            self._json(404, {"ok": False, "message": "not found"})
            return
        if not self._authorized():
            self._json(401, {"ok": False, "message": "unauthorized"})
            return
        if _state.get("running"):
            self._json(409, {"ok": False, "message": "pull already running", **{k: _state[k] for k in ("started_at",)}})
            return
        if not _start_pull():
            self._json(409, {"ok": False, "message": "pull already running"})
            return
        self._json(202, {"ok": True, "message": "pull started", "running": True})

    def log_message(self, fmt: str, *args) -> None:
        path = urlparse(self.path).path if self.path else ""
        if path.startswith("/api/") or (args and str(args[1]).startswith(("4", "5"))):
            super().log_message(fmt, *args)


def main() -> None:
    if not ROOT.is_dir():
        raise SystemExit(f"dist missing: {ROOT} (run sync/build first)")
    _ensure_token()
    _write_status()
    httpd = ThreadingHTTPServer((HOST, PORT), SpaHandler)
    print(f"m-e621 serving {ROOT} on http://{HOST}:{PORT}", flush=True)
    print(f"m-e621 pull token file: {TOKEN_PATH}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
