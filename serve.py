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
        # Bounce the HTTP process so new serve.py routes (e.g. Tailspace proxy) load.
        # Delay so this status write and the API response can finish first.
        restart_cmd = (
            f"sleep 2; "
            f"pkill -f '{APP_DIR}/serve.py' || true; "
            f"rm -f '{CONFIG_DIR}/m-e621.pid'; "
            f"sleep 1; "
            f"'{APP_DIR}/start'"
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
    return {
        "id": comic.get("id"),
        "name": comic.get("name"),
        "category": comic.get("category"),
        "state": comic.get("state"),
        "numberOfPages": int(comic.get("numberOfPages") or len(pages)),
        "description": comic.get("description"),
        "avgStars": comic.get("avgStars"),
        "commentCount": len(comments),
        "thumbnailVersion": comic.get("thumbnailVersion") or 0,
        "artistName": artist.get("name") or artist.get("creatorUsername") or "",
        "artistDisplayName": artist.get("name") or artist.get("creatorUsername") or "",
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

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
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
        return None

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

    def _tailspace_request(
        self,
        url: str,
        *,
        accept: str = "application/json, */*",
        timeout: int = 30,
    ) -> tuple[bytes, int, str]:
        """Fetch a Tailspace URL and return (body, status, content_type)."""
        req = urllib.request.Request(url, method="GET")
        req.add_header("Accept", accept)
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        req.add_header(
            "User-Agent",
            f"me621-tailspace-proxy/1.0 (https://{DOMAIN}; read-only browser proxy)",
        )
        # Tailspace expects the referer / sec-fetch headers for data endpoints
        req.add_header("Referer", TAILSPACE_BASE + "/")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                status = getattr(resp, "status", 200)
                ct = resp.headers.get("Content-Type", "application/json")
            return body, status, ct
        except urllib.error.HTTPError as exc:
            return exc.read(), exc.code, "application/json"

    def _proxy_tailspace_posts(self, parsed) -> None:
        params = parse_qs(parsed.query)
        page = (params.get("page") or ["1"])[0]
        try:
            page_n = max(1, int(page))
        except ValueError:
            page_n = 1
        url = f"{TAILSPACE_BASE}/api/get-browse-posts-paginated?page={page_n}"
        body, status, ct = self._tailspace_request(url)
        if status == 200:
            try:
                data = _normalize_tailspace_posts(json.loads(body))
                self._json(200, data)
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
        body, status, _ct = self._tailspace_request(
            url,
            accept="text/x-turbo-stream, application/json, */*",
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            data = _parse_tailspace_comics_response(body)
            self._json(200, data)
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"parse error: {exc}"})

    def _proxy_tailspace_comic(self, parsed) -> None:
        params = parse_qs(parsed.query)
        name = (params.get("name") or [""])[0].strip()
        if not name:
            self._json(400, {"ok": False, "message": "name required"})
            return

        url = f"{TAILSPACE_BASE}/c/{quote(name, safe='')}.data"
        body, status, _ct = self._tailspace_request(
            url,
            accept="text/x-turbo-stream, application/json, */*",
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            data = _parse_tailspace_comic_detail(body)
            self._json(200, data)
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
        body, status, _ct = self._tailspace_request(
            url,
            accept="text/x-turbo-stream, application/json, */*",
        )
        if status != 200:
            self._json(status, {"ok": False, "message": f"upstream returned {status}"})
            return
        try:
            comments = _parse_tailspace_post_comments(body)
            self._json(200, {"comments": comments})
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"parse error: {exc}"})

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
