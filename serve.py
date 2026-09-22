#!/usr/bin/env python3
"""Serve PawDeck dist/ + same-origin API proxies and optional git-pull control.

FurAffinity: install faapi (`uv venv .venv && uv pip install -r requirements.txt`).
Optional FA_COOKIE_A / FA_COOKIE_B for host-wide login.
"""
from __future__ import annotations

import base64
import fcntl
import hashlib
import ipaddress
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urljoin, urlparse


class _NoHTTPRedirect(urllib.request.HTTPRedirectHandler):
    """Do not auto-follow redirects — callers re-validate each hop (M27)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoHTTPRedirect)


def _urlopen_no_redirect(req: urllib.request.Request, timeout: float | int):
    """urlopen that raises HTTPError on 3xx instead of following."""
    return _NO_REDIRECT_OPENER.open(req, timeout=timeout)


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
SCENT_MARKS_PATH = CONFIG_DIR / "scent_marks.json"
SCENT_ADMIN_HASH_PATH = CONFIG_DIR / "scent_marks_admin.hash"
_SCENT_ROOT = Path(__file__).resolve().parent
# Docker copies beside serve.py; checkout keeps the file under src/Landing/.
SCENT_BLOCKLIST_CANDIDATES = (
    _SCENT_ROOT / "scentMarksBlocklist.json",
    _SCENT_ROOT / "src" / "Landing" / "scentMarksBlocklist.json",
)
SCENT_MARKS_LIST_PATH = re.compile(r"^/api/scent-marks/?$")
SCENT_MARKS_AUTH_PATH = re.compile(r"^/api/scent-marks/auth/?$")
SCENT_MARK_ITEM_PATH = re.compile(r"^/api/scent-marks/([A-Za-z0-9_-]{8,64})$")
SCENT_MARK_PIN_PATH = re.compile(
    r"^/api/scent-marks/([A-Za-z0-9_-]{8,64})/pin/?$"
)
SCENT_MAX_BODY = 500
SCENT_MAX_NAME = 32
SCENT_MAX_MARKS = 500
SCENT_RATE_SECONDS = 60
_scent_rate_lock = threading.Lock()
_scent_rate_by_ip: dict[str, float] = {}
_scent_block_words: list[str] = []
_scent_block_word_res: list[tuple[str, re.Pattern[str]]] = []
_scent_block_patterns: list[tuple[str, re.Pattern[str]]] = []
# "pending" | "ok" | "missing" — POST fails closed when not "ok".
_scent_blocklist_status = "pending"


def _scent_strip_controls(value: str) -> str:
    return "".join(ch for ch in value if ch == "\n" or ch == "\t" or ord(ch) >= 32)


def _scent_load_blocklist() -> None:
    """Load shared client/server blocklist once (words + spam pattern ids)."""
    global _scent_block_words, _scent_block_word_res, _scent_block_patterns
    global _scent_blocklist_status
    if _scent_blocklist_status != "pending":
        return
    raw: object | None = None
    last_err: Exception | None = None
    for path in SCENT_BLOCKLIST_CANDIDATES:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            break
        except (OSError, json.JSONDecodeError) as exc:
            last_err = exc
            continue
    if raw is None or not isinstance(raw, dict):
        _scent_blocklist_status = "missing"
        print(
            f"[scent-marks] blocklist unavailable ({last_err or 'invalid JSON'}); "
            "POST /api/scent-marks will return 503",
            file=sys.stderr,
        )
        return
    words: list[str] = []
    for item in raw.get("words") or []:
        if not isinstance(item, str):
            continue
        term = item.strip().lower()
        if term:
            words.append(term)
    word_res: list[tuple[str, re.Pattern[str]]] = []
    for term in words:
        word_res.append(
            (
                term,
                re.compile(
                    rf"(?<![A-Za-z0-9_]){re.escape(term)}(?![A-Za-z0-9_])",
                    re.IGNORECASE,
                ),
            )
        )
    patterns: list[tuple[str, re.Pattern[str]]] = []
    for item in raw.get("patterns") or []:
        if not isinstance(item, dict):
            continue
        pid = item.get("id")
        preg = item.get("regex")
        if not isinstance(pid, str) or not isinstance(preg, str) or not pid or not preg:
            continue
        try:
            patterns.append((pid, re.compile(preg, re.IGNORECASE)))
        except re.error:
            continue
    _scent_block_words = words
    _scent_block_word_res = word_res
    _scent_block_patterns = patterns
    _scent_blocklist_status = "ok"


def _scent_blocklist_ready() -> bool:
    _scent_load_blocklist()
    return _scent_blocklist_status == "ok"


def _scent_find_blocked(text: str, name: str | None) -> list[str]:
    """Return blocked labels / pattern ids in first-seen order (deduped)."""
    _scent_load_blocklist()
    haystacks = [h for h in (text, name or "") if h and h.strip()]
    if not haystacks:
        return []
    hits: list[str] = []
    seen: set[str] = set()

    def push(label: str) -> None:
        if not label or label in seen:
            return
        seen.add(label)
        hits.append(label)

    for hay in haystacks:
        for term, cre in _scent_block_word_res:
            if cre.search(hay):
                push(term)
        for pid, cre in _scent_block_patterns:
            if cre.search(hay):
                push(pid)
    return hits


def _scent_blocked_message(blocked: list[str]) -> str:
    return "Blocked: " + ", ".join(blocked)


def _scent_client_ip(handler: SimpleHTTPRequestHandler) -> str:
    # Never trust client-supplied forwarding headers — they are spoofable when
    # serve.py is reachable directly. The reverse proxy should connect from a
    # trusted peer; rate limits use the TCP peer only (same as custom news).
    return handler.client_address[0] if handler.client_address else "unknown"


def _scent_admin_rate_ok(ip: str) -> bool:
    """Stricter throttle for auth / pin / delete (shared bucket with posts)."""
    return _scent_rate_ok(f"admin:{ip}")


def _scent_admin_rate_stamp(ip: str) -> None:
    _scent_rate_stamp(f"admin:{ip}")


def _scent_rate_ok(ip: str) -> bool:
    now = time.time()
    with _scent_rate_lock:
        last = _scent_rate_by_ip.get(ip, 0.0)
        return now - last >= SCENT_RATE_SECONDS


def _scent_rate_stamp(ip: str) -> None:
    now = time.time()
    with _scent_rate_lock:
        _scent_rate_by_ip[ip] = now
        if len(_scent_rate_by_ip) > 2000:
            cutoff = now - SCENT_RATE_SECONDS * 2
            stale = [k for k, t in _scent_rate_by_ip.items() if t < cutoff]
            for k in stale:
                _scent_rate_by_ip.pop(k, None)


def _scent_load_locked(fh) -> list[dict]:
    fh.seek(0)
    raw = fh.read()
    if not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    marks = data.get("marks") if isinstance(data, dict) else data
    if not isinstance(marks, list):
        return []
    return [m for m in marks if isinstance(m, dict)]


def _scent_save_locked(fh, marks: list[dict]) -> None:
    fh.seek(0)
    fh.truncate()
    json.dump({"marks": marks}, fh, ensure_ascii=False, separators=(",", ":"))
    fh.flush()
    os.fsync(fh.fileno())


def _scent_verify_admin(password: str) -> bool:
    if not password or not SCENT_ADMIN_HASH_PATH.is_file():
        return False
    try:
        line = SCENT_ADMIN_HASH_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    parts = line.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    try:
        iterations = int(parts[1])
        salt = base64.b64decode(parts[2])
        expected = base64.b64decode(parts[3])
    except (ValueError, OSError):
        return False
    if iterations < 100_000 or not salt or not expected:
        return False
    got = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return secrets.compare_digest(got, expected)


def _git_pull_enabled() -> bool:
    """Managed git-pull API. Off when M_E621_GIT_PULL=0; on when =1; else if token file exists."""
    raw = os.environ.get("M_E621_GIT_PULL", "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    try:
        return TOKEN_PATH.is_file() and bool(
            TOKEN_PATH.read_text(encoding="utf-8").strip()
        )
    except OSError:
        return False


FAVORITE_HOSTS = frozenset({"e621.net", "e926.net", "e6ai.net"})
FAVORITE_PATH = re.compile(r"^/api/favorites(?:/(\d+))?$")
VOTES_PATH = re.compile(r"^/api/votes/?$")
COMMENTS_PATH = re.compile(r"^/api/comments/?$")
MEDIA_HOST_SUFFIXES = (".e621.net", ".e926.net", ".e6ai.net")
TAILSPACE_BASE = "https://tailspace.com"
TAILSPACE_CDN = "https://pics.tailspace.com"
# Comic/post media CDN for /api/download (Pools covers, Save Locally, etc.).
TAILSPACE_MEDIA_HOSTS = frozenset({"pics.tailspace.com"})
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
FURBOORU_GALLERIES_PATH = re.compile(r"^/api/furbooru/galleries$")
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

ITAKU_API_BASE = "https://itaku.ee/api"
ITAKU_MEDIA_HOSTS = frozenset({"itaku.ee", "www.itaku.ee"})
ITAKU_AUTH_PATH = re.compile(r"^/api/itaku/auth/user$")
ITAKU_FEED_PATH = re.compile(r"^/api/itaku/feed$")
ITAKU_STARS_PATH = re.compile(r"^/api/itaku/stars$")
ITAKU_TAGS_PATH = re.compile(r"^/api/itaku/tags$")
ITAKU_IMAGES_PATH = re.compile(r"^/api/itaku/images$")
ITAKU_IMAGE_PATH = re.compile(r"^/api/itaku/images/(\d+)$")
ITAKU_COMMENTS_PATH = re.compile(r"^/api/itaku/images/(\d+)/comments$")
ITAKU_COMMENT_PATH = re.compile(r"^/api/itaku/images/(\d+)/comment$")
ITAKU_LIKE_PATH = re.compile(r"^/api/itaku/images/(\d+)/like$")
ITAKU_USER_PATH = re.compile(r"^/api/itaku/users/([^/]+)$")
ITAKU_POST_PATH = re.compile(r"^/api/itaku/posts/(\d+)$")

SOFURRY_BASE = "https://sofurry.com"
SOFURRY_MEDIA_HOSTS = frozenset({
    "sofurry.com",
    "www.sofurry.com",
    "cdn.sofurryfiles.com",
    "s3.sofurryfiles.com",
    "sofurryfiles.com",
})
SOFURRY_COOKIE_HEADER = "X-Sofurry-Cookies"
SOFURRY_PATH = re.compile(r"^/api/sofurry(?:/.*)?$")
SOFURRY_AUTH_POSTS = {
    "/api/sofurry/login",
    "/api/sofurry/login-cookies",
}

# Must match src/worker/news/registry.ts + feeds.ts (resolveNewsRssUrl).
NEWS_RSS_PAGE_MAX = 8
# Per-source upstream budget; keep in sync with src/worker/news/timeouts.ts
NEWS_RSS_TIMEOUT_SEC = 5
NEWS_SOURCES = frozenset({"flayrah", "dogpatch", "infurnation", "fwg"})
NEWS_PAGING_SOURCES = frozenset({"dogpatch", "infurnation", "fwg"})
FLAYRAH_RSS_URL = "https://www.flayrah.com/rss-full.xml"
DOGPATCH_RSS_URL = "https://dogpatch.press/feed/"
INFURNATION_RSS_URL = "https://www.infurnation.com/feed/"
FWG_RSS_URL = "https://furrywritersguild.com/feed/"
DOGPATCH_CATEGORY_FEEDS = {
    "announcements": "https://dogpatch.press/category/announcements/feed/",
    "business": "https://dogpatch.press/category/business/feed/",
    "costuming": "https://dogpatch.press/category/costuming/feed/",
    "current-events": "https://dogpatch.press/category/current-events/feed/",
    "interviews": "https://dogpatch.press/category/interviews/feed/",
    "media": "https://dogpatch.press/category/media/feed/",
    "on-the-scene": "https://dogpatch.press/category/on-the-scene/feed/",
    "opinion": "https://dogpatch.press/category/opinion/feed/",
    "personalities": "https://dogpatch.press/category/personalities/feed/",
    "reviews": "https://dogpatch.press/category/reviews/feed/",
    "science": "https://dogpatch.press/category/science/feed/",
    "society-and-culture": "https://dogpatch.press/category/society-and-culture/feed/",
    "special-feature": "https://dogpatch.press/category/special-feature/feed/",
}
NEWS_MEDIA_HOSTS = frozenset({
    "flayrah.com",
    "www.flayrah.com",
    "dogpatch.press",
    "www.dogpatch.press",
    "infurnation.com",
    "www.infurnation.com",
    "furrywritersguild.com",
    "www.furrywritersguild.com",
})
# Back-compat alias
FLAYRAH_MEDIA_HOSTS = NEWS_MEDIA_HOSTS
NEWS_RSS_PATH = "/api/news/rss"
NEWS_ARTICLE_PATH = re.compile(
    r"^/api/news/article/(flayrah|dogpatch|infurnation|fwg)/(\d+)$"
)
NEWS_CUSTOM_RSS_PATH = "/api/news/custom/rss"
NEWS_CUSTOM_ARTICLE_PATH = "/api/news/custom/article"
NEWS_CUSTOM_MEDIA_PATH = "/api/news/custom/media"
# Custom News fetch limits (keep in sync with src/worker/news/customUrl.ts).
CUSTOM_NEWS_RSS_MAX_BYTES = 2 * 1024 * 1024
CUSTOM_NEWS_HTML_MAX_BYTES = int(1.5 * 1024 * 1024)
CUSTOM_NEWS_MEDIA_MAX_BYTES = 4 * 1024 * 1024
CUSTOM_NEWS_ARTICLE_TIMEOUT_SEC = 15
CUSTOM_NEWS_MEDIA_TIMEOUT_SEC = 10
CUSTOM_NEWS_MAX_REDIRECTS = 3
CUSTOM_NEWS_RATE_BURST = 30  # sliding window count per IP
_custom_news_rate_lock = threading.Lock()
_custom_news_rate_by_ip: dict[str, list[float]] = {}
FLAYRAH_RSS_PATH = "/api/flayrah/rss"
FLAYRAH_ARTICLE_PATH = re.compile(r"^/api/flayrah/article/(\d+)$")
# Curated taxonomy feeds (must match src/worker/news/registry.ts).
FLAYRAH_FEEDS = {
    "full": FLAYRAH_RSS_URL,
    "reviews": "https://www.flayrah.com/taxonomy/term/37/0/feed",
    "opinion": "https://www.flayrah.com/taxonomy/term/36/0/feed",
    "media": "https://www.flayrah.com/taxonomy/term/41/0/feed",
    "conventions": "https://www.flayrah.com/taxonomy/term/30/0/feed",
    "games": "https://www.flayrah.com/taxonomy/term/60/0/feed",
    "science-fiction": "https://www.flayrah.com/taxonomy/term/32/0/feed",
    "art": "https://www.flayrah.com/taxonomy/term/49/0/feed",
    "wikifur-news": "https://www.flayrah.com/taxonomy/term/51/0/feed",
}
NEWS_ARTICLE_URLS = {
    "flayrah": "https://www.flayrah.com/node/{id}",
    "dogpatch": "https://dogpatch.press/?p={id}",
    "infurnation": "https://www.infurnation.com/?p={id}",
    "fwg": "https://furrywritersguild.com/?p={id}",
}
NEWS_FULL_RSS = {
    "flayrah": FLAYRAH_RSS_URL,
    "dogpatch": DOGPATCH_RSS_URL,
    "infurnation": INFURNATION_RSS_URL,
    "fwg": FWG_RSS_URL,
}


def _custom_news_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Block non-public addresses (align with src/worker/news/customUrl.ts)."""
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or not ip.is_global
    ):
        return True
    # Shared Address Space / CGNAT (100.64/10) — is_global is already False on
    # current Python, but keep an explicit range check for older interpreters.
    if isinstance(ip, ipaddress.IPv4Address):
        n = int(ip)
        if (n >> 22) == (0x6440 >> 6):  # 100.64.0.0/10
            return True
    return False


def _custom_news_blocked_hostname(hostname: str) -> bool:
    h = (hostname or "").strip().lower().rstrip(".")
    if not h:
        return True
    if h in {"localhost", "metadata", "metadata.google.internal"}:
        return True
    if h.endswith(".localhost") or h.endswith(".local") or h.endswith(".internal"):
        return True
    try:
        ip = ipaddress.ip_address(h)
        return _custom_news_ip_blocked(ip)
    except ValueError:
        return False


def _custom_news_validate_https_url(raw: str) -> tuple[str | None, str | None]:
    """Return (href, error). Rejects non-https, credentials, private hosts."""
    if not raw or not str(raw).strip():
        return None, "url required"
    try:
        parsed = urlparse(str(raw).strip())
    except Exception:  # noqa: BLE001
        return None, "invalid url"
    if parsed.scheme != "https":
        return None, "https only"
    if parsed.username or parsed.password:
        return None, "credentials not allowed"
    if parsed.port not in (None, 443):
        return None, "port not allowed"
    host = (parsed.hostname or "").lower()
    if _custom_news_blocked_hostname(host):
        return None, "host not allowed"
    # Rebuild without fragment
    href = parsed._replace(fragment="").geturl()
    return href, None


def _custom_news_assert_public_host(hostname: str) -> None:
    if _custom_news_blocked_hostname(hostname):
        raise ValueError("host not allowed")
    try:
        ipaddress.ip_address(hostname)
        return  # literal already checked
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("dns lookup failed") from exc
    if not infos:
        raise ValueError("dns lookup failed")
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError as exc:
            raise ValueError("host not allowed") from exc
        if _custom_news_ip_blocked(ip):
            raise ValueError("host not allowed")


def _custom_news_content_ok(kind: str, content_type: str, body: bytes) -> bool:
    ct = (content_type or "").lower()
    if kind == "rss":
        if "xml" in ct or "rss" in ct or "atom" in ct or "text/plain" in ct:
            return True
        head = body[:200].decode("utf-8", errors="ignore")
        return bool(re.search(r"<(\?xml|rss|feed)\b", head, re.I))
    if kind == "html":
        return "html" in ct or "xhtml" in ct or "text/plain" in ct
    if kind == "image":
        return ct.startswith("image/")
    return False


FLUFFLE_API = "https://api.fluffle.xyz/exact-search-by-file"
FLUFFLE_UA = "PawDeck/1.0 (by lovelyspacedog on GitHub)"
FLUFFLE_PATH = "/api/fluffle/exact-search"
# Furbooru / Philomena CDN (also used by Fluffle source fetch).
FURRYCDN_HOSTS = frozenset({"furrycdn.org"})
FURRYCDN_SUFFIXES = (".furrycdn.org",)
# Extra CDN hosts allowed only for Fluffle source fetch (not general /api/download).
FLUFFLE_EXTRA_HOSTS = frozenset({"pics.tailspace.com"})
FLUFFLE_EXTRA_SUFFIXES: tuple[str, ...] = ()

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
    print(f"PawDeck created pull token at {TOKEN_PATH}", flush=True)
    return token


def _git_public_status() -> dict:
    """Unauthenticated: no head/log_tail (avoid leaking host state)."""
    return {
        "pull_enabled": _git_pull_enabled(),
        "branch": BRANCH,
        "running": bool(_state.get("running")) if _git_pull_enabled() else False,
    }


def _git_authed_status() -> dict:
    """Authenticated status for Settings → Info. Never expose log_tail to the browser."""
    return {
        "running": _state.get("running"),
        "started_at": _state.get("started_at"),
        "finished_at": _state.get("finished_at"),
        "ok": _state.get("ok"),
        "message": _state.get("message"),
        "before": _state.get("before"),
        "after": _state.get("after"),
        "head": _git_head(),
        "branch": BRANCH,
        "pull_enabled": True,
    }


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

    def _scent_admin_password(self) -> str:
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return (self.headers.get("X-Scent-Admin") or "").strip()

    def _handle_scent_marks_get(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(SCENT_MARKS_PATH, "a+", encoding="utf-8") as fh:
                fcntl.flock(fh.fileno(), fcntl.LOCK_SH)
                try:
                    marks = _scent_load_locked(fh)
                finally:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError as exc:
            self._json(500, {"ok": False, "message": f"storage error: {exc}"})
            return
        # Newest first, then stable-sort pinned marks to the top.
        ordered = sorted(
            marks,
            key=lambda m: str(m.get("createdAt") or ""),
            reverse=True,
        )
        ordered = sorted(
            ordered,
            key=lambda m: 0 if m.get("pinned") else 1,
        )
        public = [
            {
                "id": m.get("id"),
                "text": m.get("text"),
                "name": m.get("name"),
                "createdAt": m.get("createdAt"),
                "pinned": bool(m.get("pinned")),
            }
            for m in ordered
            if isinstance(m.get("id"), str) and isinstance(m.get("text"), str)
        ]
        self._json(200, {"ok": True, "marks": public})

    def _handle_scent_marks_post(self, body: bytes) -> None:
        ip = _scent_client_ip(self)
        if not _scent_blocklist_ready():
            self._json(
                503,
                {
                    "ok": False,
                    "message": "moderation blocklist unavailable — cannot accept posts",
                },
            )
            return
        if not _scent_rate_ok(ip):
            self._json(
                429,
                {
                    "ok": False,
                    "message": f"rate limited — try again in {SCENT_RATE_SECONDS}s",
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
        text = _scent_strip_controls(str(payload.get("text") or "")).strip()
        if not text:
            self._json(400, {"ok": False, "message": "text required"})
            return
        if len(text) > SCENT_MAX_BODY:
            self._json(
                400,
                {"ok": False, "message": f"text max {SCENT_MAX_BODY} characters"},
            )
            return
        name_raw = payload.get("name")
        name: str | None = None
        if name_raw is not None and str(name_raw).strip():
            name = _scent_strip_controls(str(name_raw)).strip()
            if len(name) > SCENT_MAX_NAME:
                self._json(
                    400,
                    {"ok": False, "message": f"name max {SCENT_MAX_NAME} characters"},
                )
                return
        blocked = _scent_find_blocked(text, name)
        if blocked:
            self._json(
                400,
                {
                    "ok": False,
                    "message": _scent_blocked_message(blocked),
                    "blocked": blocked,
                },
            )
            return
        mark = {
            "id": secrets.token_urlsafe(12),
            "text": text,
            "name": name,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "pinned": False,
        }
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(SCENT_MARKS_PATH, "a+", encoding="utf-8") as fh:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                try:
                    marks = _scent_load_locked(fh)
                    marks.append(mark)
                    if len(marks) > SCENT_MAX_MARKS:
                        marks = sorted(
                            marks,
                            key=lambda m: str(m.get("createdAt") or ""),
                        )[-SCENT_MAX_MARKS:]
                    _scent_save_locked(fh, marks)
                finally:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError as exc:
            self._json(500, {"ok": False, "message": f"storage error: {exc}"})
            return
        _scent_rate_stamp(ip)
        self._json(201, {"ok": True, "mark": mark})

    def _handle_scent_marks_auth(self) -> None:
        """Verify admin password without deleting (Unlock UI)."""
        ip = _scent_client_ip(self)
        if not _scent_admin_rate_ok(ip):
            self._json(
                429,
                {
                    "ok": False,
                    "message": f"rate limited — try again in {SCENT_RATE_SECONDS}s",
                },
            )
            return
        password = self._scent_admin_password()
        if not SCENT_ADMIN_HASH_PATH.is_file():
            self._json(
                503,
                {
                    "ok": False,
                    "message": "admin hash not configured on host",
                },
            )
            return
        if not _scent_verify_admin(password):
            _scent_admin_rate_stamp(ip)
            self._json(401, {"ok": False, "message": "unauthorized"})
            return
        _scent_admin_rate_stamp(ip)
        self._json(200, {"ok": True})

    def _handle_scent_marks_delete(self, mark_id: str) -> None:
        ip = _scent_client_ip(self)
        if not _scent_admin_rate_ok(ip):
            self._json(
                429,
                {
                    "ok": False,
                    "message": f"rate limited — try again in {SCENT_RATE_SECONDS}s",
                },
            )
            return
        password = self._scent_admin_password()
        if not _scent_verify_admin(password):
            _scent_admin_rate_stamp(ip)
            self._json(401, {"ok": False, "message": "unauthorized"})
            return
        _scent_admin_rate_stamp(ip)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(SCENT_MARKS_PATH, "a+", encoding="utf-8") as fh:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                try:
                    marks = _scent_load_locked(fh)
                    kept = [m for m in marks if m.get("id") != mark_id]
                    if len(kept) == len(marks):
                        self._json(404, {"ok": False, "message": "not found"})
                        return
                    _scent_save_locked(fh, kept)
                finally:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError as exc:
            self._json(500, {"ok": False, "message": f"storage error: {exc}"})
            return
        self._json(200, {"ok": True, "deleted": mark_id})

    def _handle_scent_marks_pin(self, mark_id: str, body: bytes) -> None:
        ip = _scent_client_ip(self)
        if not _scent_admin_rate_ok(ip):
            self._json(
                429,
                {
                    "ok": False,
                    "message": f"rate limited — try again in {SCENT_RATE_SECONDS}s",
                },
            )
            return
        password = self._scent_admin_password()
        if not _scent_verify_admin(password):
            _scent_admin_rate_stamp(ip)
            self._json(401, {"ok": False, "message": "unauthorized"})
            return
        _scent_admin_rate_stamp(ip)
        try:
            payload = json.loads(body.decode("utf-8") or "{}") if body else {}
            if not isinstance(payload, dict):
                raise ValueError("object required")
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            self._json(400, {"ok": False, "message": f"invalid json: {exc}"})
            return
        if "pinned" not in payload:
            self._json(400, {"ok": False, "message": "pinned required"})
            return
        pinned = payload.get("pinned")
        if not isinstance(pinned, bool):
            self._json(400, {"ok": False, "message": "pinned must be boolean"})
            return
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        updated: dict | None = None
        try:
            with open(SCENT_MARKS_PATH, "a+", encoding="utf-8") as fh:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                try:
                    marks = _scent_load_locked(fh)
                    for mark in marks:
                        if mark.get("id") == mark_id:
                            mark["pinned"] = pinned
                            updated = {
                                "id": mark.get("id"),
                                "text": mark.get("text"),
                                "name": mark.get("name"),
                                "createdAt": mark.get("createdAt"),
                                "pinned": bool(mark.get("pinned")),
                            }
                            break
                    if updated is None:
                        self._json(404, {"ok": False, "message": "not found"})
                        return
                    _scent_save_locked(fh, marks)
                finally:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except OSError as exc:
            self._json(500, {"ok": False, "message": f"storage error: {exc}"})
            return
        self._json(200, {"ok": True, "mark": updated})

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
                "Authorization, Content-Type, X-Pull-Token, X-Site-Base, Range, "
                "X-Tailspace-Session, X-Sofurry-Cookies, X-Scent-Admin",
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
        if host in ITAKU_MEDIA_HOSTS or host.endswith(".itaku.ee"):
            return parsed.geturl()
        if host in SOFURRY_MEDIA_HOSTS or host.endswith(".sofurryfiles.com"):
            return parsed.geturl()
        if host in NEWS_MEDIA_HOSTS or host.endswith(".wp.com") or host.endswith(".wordpress.com"):
            return parsed.geturl()
        if host in FURRYCDN_HOSTS or host.endswith(FURRYCDN_SUFFIXES):
            return parsed.geturl()
        if host in TAILSPACE_MEDIA_HOSTS:
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
                with _urlopen_no_redirect(req, timeout=60) as resp:
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
                # Prefer header / env over ?fa= (query is last-resort for <img src>).
                fa_cookies = (self.headers.get("X-FA-Cookies") or "").strip()
                if not fa_cookies:
                    parts = []
                    a = os.environ.get("FA_COOKIE_A", "").strip()
                    b = os.environ.get("FA_COOKIE_B", "").strip()
                    if a:
                        parts.append(f"a={a}")
                    if b:
                        parts.append(f"b={b}")
                    fa_cookies = "; ".join(parts)
                if not fa_cookies:
                    fa_cookies = (parse_qs(urlparse(self.path).query).get("fa") or [""])[0]
                if fa_cookies:
                    req.add_header("Cookie", fa_cookies.replace(";", "; "))
            if host in WEASYL_MEDIA_HOSTS:
                req.add_header("Referer", "https://www.weasyl.com")
            if host in ITAKU_MEDIA_HOSTS or host.endswith(".itaku.ee"):
                req.add_header("Referer", "https://itaku.ee")
            if host in SOFURRY_MEDIA_HOSTS or host.endswith(".sofurryfiles.com"):
                req.add_header("Referer", "https://sofurry.com")
            try:
                with _urlopen_no_redirect(req, timeout=120) as resp:
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
    # Itaku proxy helpers
    # ------------------------------------------------------------------

    def _itaku_api_key(self, parsed) -> str | None:
        params = parse_qs(parsed.query)
        key = (params.get("key") or [""])[0].strip()
        if key.lower().startswith("token "):
            key = key[6:].strip()
        return key or None

    def _itaku_forward_query(self, parsed) -> str:
        params = parse_qs(parsed.query, keep_blank_values=True)
        parts: list[str] = []
        for key, values in params.items():
            if key == "key":
                continue
            for val in values:
                parts.append(f"{quote(key)}={quote(val)}")
        return "&".join(parts)

    def _itaku_request(
        self,
        url: str,
        *,
        method: str = "GET",
        api_key: str | None = None,
        body: bytes = b"",
        timeout: int = 30,
    ) -> tuple[bytes, int, str]:
        req = urllib.request.Request(url, method=method)
        req.add_header("Accept", "application/json")
        req.add_header(
            "User-Agent",
            f"me621-itaku-proxy/1.0 (https://{DOMAIN}; browser proxy)",
        )
        if api_key:
            req.add_header("Authorization", f"Token {api_key}")
        if body:
            req.add_header("Content-Type", "application/json")
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
            return (
                json.dumps({"detail": str(exc)}).encode(),
                502,
                "application/json",
            )

    def _itaku_respond(self, body: bytes, status: int, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy_itaku_get(self, upstream_path: str, parsed) -> None:
        api_key = self._itaku_api_key(parsed)
        qs = self._itaku_forward_query(parsed)
        url = f"{ITAKU_API_BASE}/{upstream_path.lstrip('/')}"
        if qs:
            url = f"{url}?{qs}"
        body, status, ct = self._itaku_request(url, api_key=api_key)
        self._itaku_respond(body, status, ct)

    def _proxy_itaku_like(self, method: str, image_id: str, parsed, body: bytes = b"") -> None:
        api_key = self._itaku_api_key(parsed)
        if not api_key:
            self._json(401, {"detail": "Authentication credentials were not provided."})
            return
        url = f"{ITAKU_API_BASE}/galleries/images/{image_id}/like/"
        resp_body, status, ct = self._itaku_request(
            url, method=method, api_key=api_key, body=body
        )
        self._itaku_respond(resp_body, status, ct)

    def _proxy_itaku_comment_create(
        self, image_id: str, parsed, body: bytes = b""
    ) -> None:
        api_key = self._itaku_api_key(parsed)
        if not api_key:
            self._json(401, {"detail": "Authentication credentials were not provided."})
            return
        url = f"{ITAKU_API_BASE}/galleries/images/{image_id}/comment/"
        resp_body, status, ct = self._itaku_request(
            url, method="POST", api_key=api_key, body=body
        )
        self._itaku_respond(resp_body, status, ct)

    # ------------------------------------------------------------------
    # SoFurry proxy helpers
    # ------------------------------------------------------------------

    def _sofurry_cookies(self) -> str:
        return (self.headers.get(SOFURRY_COOKIE_HEADER) or "").strip()

    @staticmethod
    def _sofurry_merge_cookies(existing: str, resp_headers) -> str:
        jar: dict[str, str] = {}
        for part in existing.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            k, v = part.split("=", 1)
            jar[k.strip()] = v.strip()
        raw_list = []
        if hasattr(resp_headers, "get_all"):
            raw_list = resp_headers.get_all("Set-Cookie") or []
        elif resp_headers.get("Set-Cookie"):
            raw_list = [resp_headers.get("Set-Cookie")]
        for line in raw_list:
            first = (line or "").split(";", 1)[0].strip()
            if "=" not in first:
                continue
            k, v = first.split("=", 1)
            jar[k.strip()] = v.strip()
        return "; ".join(f"{k}={v}" for k, v in jar.items())

    @staticmethod
    def _sofurry_session_payload(cookie: str) -> dict:
        for part in cookie.split(";"):
            part = part.strip()
            if not part.lower().startswith("_session="):
                continue
            val = part.split("=", 1)[1]
            try:
                raw = unquote(val)
                payload = raw.split(".", 1)[0]
                pad = "=" * ((4 - len(payload) % 4) % 4)
                data = json.loads(base64.urlsafe_b64decode(payload + pad))
                return data if isinstance(data, dict) else {}
            except Exception:  # noqa: BLE001
                return {}
        return {}

    @classmethod
    def _sofurry_csrf(cls, cookie: str) -> str:
        """Remix CSRF lives on `_session.csrfToken`. Never use Laravel XSRF-TOKEN."""
        data = cls._sofurry_session_payload(cookie)
        token = data.get("csrfToken") or data.get("csrf_token") or ""
        return str(token) if token else ""

    @classmethod
    def _sofurry_remix_authed(cls, cookie: str) -> bool:
        data = cls._sofurry_session_payload(cookie)
        return any(k not in ("csrfToken", "csrf_token") for k in data)

    def _sofurry_upgrade_remix_session(self, cookie: str) -> str:
        """Turn a Laravel `sofurry_session` into a Remix `_session` via OAuth PKCE."""
        if not cookie or self._sofurry_remix_authed(cookie):
            return cookie
        if re.search(r"(?:^|;\s*)sofurry_session=", cookie, re.I):
            _, _, _, cookie = self._sofurry_request(
                f"{SOFURRY_BASE}/fe/auth/sofurry",
                cookie=cookie,
                accept="text/html,application/xhtml+xml",
                redirects=8,
            )
        if not self._sofurry_csrf(cookie):
            _, _, _, cookie = self._sofurry_request(
                f"{SOFURRY_BASE}/browse",
                cookie=cookie,
                accept="text/html,application/xhtml+xml",
            )
        return cookie

    def _sofurry_host_allowed(self, host: str, *, media: bool) -> bool:
        h = (host or "").lower()
        if h in ("sofurry.com", "www.sofurry.com"):
            return True
        if media and (
            h in SOFURRY_MEDIA_HOSTS or h.endswith(".sofurryfiles.com")
        ):
            return True
        return False

    def _sofurry_request(
        self,
        url: str,
        *,
        method: str = "GET",
        cookie: str = "",
        body: bytes = b"",
        content_type: str | None = None,
        accept: str = "application/json, text/html;q=0.9,*/*;q=0.8",
        extra_headers: dict | None = None,
        timeout: int = 45,
        redirects: int = 3,
        media: bool = False,
    ) -> tuple[bytes, int, str, str]:
        """Returns (body, status, content_type, merged_cookie).

        Manual redirects with per-hop host checks (no auto-follow). Cookies are
        only sent to sofurry.com / www.sofurry.com — never to CDN or off-host.
        """
        current_cookie = cookie
        current_url = url
        for _ in range(max(1, redirects + 1)):
            parsed = urlparse(current_url)
            host = (parsed.hostname or "").lower()
            if parsed.scheme != "https" or not self._sofurry_host_allowed(
                host, media=media
            ):
                return (
                    json.dumps({"detail": "redirect target not allowed"}).encode(),
                    400,
                    "application/json",
                    current_cookie,
                )
            req = urllib.request.Request(current_url, method=method)
            req.add_header("Accept", accept)
            req.add_header(
                "User-Agent",
                f"me621-sofurry-proxy/1.0 (https://{DOMAIN}; browser proxy)",
            )
            req.add_header("Referer", f"{SOFURRY_BASE}/")
            req.add_header("Origin", SOFURRY_BASE)
            # Session cookies only for the HTML origin, never CDN/off-host.
            if current_cookie and host in ("sofurry.com", "www.sofurry.com"):
                req.add_header("Cookie", current_cookie)
            csrf = self._sofurry_csrf(current_cookie)
            if csrf:
                req.add_header("X-CSRF-Token", csrf)
                req.add_header("X-CSRF-TOKEN", csrf)
            if extra_headers:
                for k, v in extra_headers.items():
                    req.add_header(k, v)
            if body:
                req.add_header(
                    "Content-Type",
                    content_type or "application/x-www-form-urlencoded",
                )
                req.data = body
            try:
                with _urlopen_no_redirect(req, timeout=timeout) as resp:
                    data = resp.read()
                    status = getattr(resp, "status", 200)
                    ct = resp.headers.get("Content-Type", "application/octet-stream")
                    if host in ("sofurry.com", "www.sofurry.com"):
                        current_cookie = self._sofurry_merge_cookies(
                            current_cookie, resp.headers
                        )
                    return data, status, ct, current_cookie
            except urllib.error.HTTPError as exc:
                if host in ("sofurry.com", "www.sofurry.com"):
                    current_cookie = self._sofurry_merge_cookies(
                        current_cookie, exc.headers
                    )
                if exc.code in (301, 302, 303, 307, 308):
                    loc = exc.headers.get("Location") if exc.headers else None
                    if loc:
                        current_url = urljoin(current_url, loc)
                        if exc.code in (301, 302, 303) and method == "POST":
                            method = "GET"
                            body = b""
                        continue
                    return (
                        json.dumps({"detail": "redirect without Location"}).encode(),
                        502,
                        "application/json",
                        current_cookie,
                    )
                return (
                    exc.read() if hasattr(exc, "read") else b"",
                    exc.code,
                    exc.headers.get("Content-Type", "application/json")
                    if exc.headers
                    else "application/json",
                    current_cookie,
                )
            except Exception as exc:  # noqa: BLE001
                return (
                    json.dumps({"detail": str(exc)}).encode(),
                    502,
                    "application/json",
                    current_cookie,
                )
        return (
            json.dumps({"detail": "too many redirects"}).encode(),
            502,
            "application/json",
            current_cookie,
        )

    def _sofurry_respond(
        self,
        body: bytes,
        status: int,
        content_type: str,
        *,
        session_rejected: bool = False,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        if session_rejected:
            self.send_header("X-Sofurry-Session-Rejected", "1")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def _sofurry_normalize_cookies(raw: str) -> str:
        """Accept full Cookie headers or a bare sofurry_session / _session value."""
        text = (raw or "").strip().strip('"').strip("'")
        if not text:
            return ""
        if re.search(
            r"(?:^|;\s*)(?:sofurry_session|_session|XSRF-TOKEN|laravel_session)\s*=",
            text,
            re.I,
        ):
            return text
        if re.match(
            r"^(?:sofurry_session|_session|XSRF-TOKEN|laravel_session)\s*=",
            text,
            re.I,
        ):
            return text
        # Bare value from DevTools — detect Remix vs Laravel encrypted cookie.
        try:
            payload = unquote(text).split(".", 1)[0]
            pad = "=" * ((4 - len(payload) % 4) % 4)
            data = json.loads(base64.urlsafe_b64decode(payload + pad))
            if isinstance(data, dict) and (
                "csrfToken" in data or "csrf_token" in data
            ):
                return f"_session={text}"
            if isinstance(data, dict) and {"iv", "value", "mac"} <= set(data):
                return f"sofurry_session={text}"
        except Exception:  # noqa: BLE001
            pass
        if text.startswith("eyJpdiI6"):
            return f"sofurry_session={text}"
        return f"sofurry_session={text}"

    def _sofurry_resolve_username(self, cookie: str) -> tuple[str | None, str]:
        browse_body, _, _, cookie = self._sofurry_request(
            f"{SOFURRY_BASE}/browse",
            cookie=cookie,
            accept="text/html,application/xhtml+xml",
        )
        handle = re.search(
            r'"USER_HANDLE":"([^"]+)"',
            browse_body.decode("utf-8", errors="ignore"),
        )
        return (handle.group(1) if handle else None), cookie

    def _sofurry_login_form(self, cookie: str, email: str, password: str) -> tuple[bytes, int, str]:
        page_body, page_status, _, cookie = self._sofurry_request(
            f"{SOFURRY_BASE}/login",
            cookie=cookie,
            accept="text/html",
        )
        if page_status >= 400 and not cookie:
            return b"", page_status, cookie
        html = page_body.decode("utf-8", errors="ignore")
        token_match = re.search(r'name="_token"\s+value="([^"]+)"', html) or re.search(
            r'name="csrf-token"\s+content="([^"]+)"', html
        )
        token = (token_match.group(1) if token_match else "") or self._sofurry_csrf(cookie)
        if not token:
            return b"", 502, cookie
        form = urlencode(
            {
                "_token": token,
                "email": email,
                "password": password,
                "remember": "on",
            }
        ).encode()
        post_body, post_status, _, cookie = self._sofurry_request(
            f"{SOFURRY_BASE}/login",
            method="POST",
            cookie=cookie,
            body=form,
            content_type="application/x-www-form-urlencoded",
            accept="text/html, application/xhtml+xml",
            extra_headers={"X-CSRF-TOKEN": token, "X-CSRF-Token": token},
            redirects=10,
        )
        return post_body, post_status, cookie

    def _proxy_sofurry_login(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except Exception:  # noqa: BLE001
            self._json(400, {"ok": False, "error": "Invalid JSON body"})
            return
        email = str(payload.get("email") or "").strip()
        password = str(payload.get("password") or "")
        if not email or not password:
            self._json(400, {"ok": False, "error": "email and password required"})
            return

        # Start Soft's Remix OAuth first so login returns into /fe/auth/callback.
        _, _, _, cookie = self._sofurry_request(
            f"{SOFURRY_BASE}/fe/auth/sofurry",
            accept="text/html,application/xhtml+xml",
            redirects=8,
        )
        post_body, post_status, cookie = self._sofurry_login_form(cookie, email, password)
        if post_status == 502 and not cookie:
            self._json(502, {"ok": False, "error": "login page failed"})
            return
        post_html = post_body.decode("utf-8", errors="ignore")
        if 'name="password"' in post_html and not self._sofurry_remix_authed(cookie):
            self._json(401, {"ok": False, "error": "Login failed — check email/password"})
            return

        cookie = self._sofurry_upgrade_remix_session(cookie)
        username, cookie = self._sofurry_resolve_username(cookie)
        if not username or not self._sofurry_remix_authed(cookie):
            self._json(
                401,
                {
                    "ok": False,
                    "error": "Login did not establish a SoFurry Remix session — try again or paste _session + sofurry_session cookies",
                },
            )
            return
        self._json(200, {"ok": True, "cookies": cookie, "username": username})

    def _proxy_sofurry_login_cookies(self, body: bytes) -> None:
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except Exception:  # noqa: BLE001
            self._json(400, {"ok": False, "error": "Invalid JSON body"})
            return
        cookies = self._sofurry_normalize_cookies(str(payload.get("cookies") or ""))
        if not cookies:
            self._json(400, {"ok": False, "error": "cookies required"})
            return

        cookie = self._sofurry_upgrade_remix_session(cookies)
        username, cookie = self._sofurry_resolve_username(cookie)
        if not username or not self._sofurry_remix_authed(cookie):
            self._json(
                401,
                {
                    "ok": False,
                    "error": "Cookies rejected — paste the _session value (or sofurry_session=_session pair) from sofurry.com while logged in",
                },
            )
            return
        self._json(200, {"ok": True, "cookies": cookie, "username": username})

    def _news_rss_target(self, source: str, feed: str, page: int) -> str | None:
        """Allowlisted RSS URL. None → 400. Mirrors resolveNewsRssUrl."""
        if page < 1 or page > NEWS_RSS_PAGE_MAX:
            return None
        if source == "all":
            if page > 1:
                return None
            return FLAYRAH_FEEDS.get("full")
        if source == "flayrah":
            if page > 1:
                return None
            return FLAYRAH_FEEDS.get(feed)
        if source == "dogpatch":
            if feed == "full":
                base = DOGPATCH_RSS_URL
            elif feed in DOGPATCH_CATEGORY_FEEDS:
                base = DOGPATCH_CATEGORY_FEEDS[feed]
            else:
                return None
            if page <= 1:
                return base
            return f"{base}?paged={page}"
        if source in ("infurnation", "fwg"):
            if feed != "full":
                return None
            base = NEWS_FULL_RSS.get(source)
            if not base:
                return None
            if page <= 1:
                return base
            return f"{base}?paged={page}"
        return None

    def _proxy_news_rss(self) -> None:
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        source = ((qs.get("source") or ["flayrah"])[0] or "flayrah").strip().lower()
        feed = ((qs.get("feed") or ["full"])[0] or "full").strip().lower()
        page_raw = ((qs.get("page") or ["1"])[0] or "1").strip()
        try:
            page = int(page_raw)
        except ValueError:
            page = 0
        target = self._news_rss_target(source, feed, page)
        if not target:
            self._json(
                400,
                {"ok": False, "message": f"unknown news source/feed: {source}/{feed}"},
            )
            return
        req = urllib.request.Request(target, method="GET")
        req.add_header(
            "User-Agent",
            f"m-e621-news-proxy/1.0 (https://{DOMAIN})",
        )
        req.add_header("Accept", "application/rss+xml, application/xml, text/xml, */*")
        try:
            with urllib.request.urlopen(req, timeout=NEWS_RSS_TIMEOUT_SEC) as resp:
                body = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/rss+xml")
        except urllib.error.HTTPError as exc:
            body = exc.read() if exc.fp else b""
            status = exc.code
            content_type = (
                exc.headers.get("Content-Type", "application/xml")
                if exc.headers
                else "application/xml"
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"news rss failed: {exc}"})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=300")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _proxy_news_article(self, source: str, node_id: str) -> None:
        if not node_id.isdigit() or int(node_id) <= 0:
            self._json(400, {"ok": False, "message": "invalid article id"})
            return
        if source not in NEWS_SOURCES:
            self._json(400, {"ok": False, "message": f"unknown news source: {source}"})
            return
        tmpl = NEWS_ARTICLE_URLS.get(source)
        if not tmpl:
            self._json(400, {"ok": False, "message": f"unknown news source: {source}"})
            return
        target = tmpl.format(id=node_id)
        req = urllib.request.Request(target, method="GET")
        req.add_header(
            "User-Agent",
            (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                f"(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 "
                f"m-e621-news-proxy/1.0 (https://{DOMAIN})"
            ),
        )
        req.add_header("Accept", "text/html,application/xhtml+xml,*/*")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "text/html; charset=utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read() if exc.fp else b""
            status = exc.code
            content_type = (
                exc.headers.get("Content-Type", "text/html")
                if exc.headers
                else "text/html"
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"news article failed: {exc}"})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=600")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _custom_news_client_ip(self) -> str:
        return (self.client_address[0] if self.client_address else "unknown") or "unknown"

    def _custom_news_rate_ok(self) -> bool:
        ip = self._custom_news_client_ip()
        now = time.time()
        window = 60.0
        with _custom_news_rate_lock:
            stamps = [t for t in _custom_news_rate_by_ip.get(ip, []) if now - t < window]
            if len(stamps) >= CUSTOM_NEWS_RATE_BURST:
                _custom_news_rate_by_ip[ip] = stamps
                return False
            stamps.append(now)
            _custom_news_rate_by_ip[ip] = stamps
            return True

    def _fetch_public_https(
        self,
        url: str,
        *,
        accept: str,
        timeout: float,
        max_bytes: int,
    ) -> tuple[int, bytes, str]:
        current = url
        for _hop in range(CUSTOM_NEWS_MAX_REDIRECTS + 1):
            href, err = _custom_news_validate_https_url(current)
            if err or not href:
                raise ValueError(err or "invalid url")
            host = urlparse(href).hostname or ""
            _custom_news_assert_public_host(host)
            req = urllib.request.Request(href, method="GET")
            req.add_header(
                "User-Agent",
                (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    f"(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 "
                    f"m-e621-news-proxy/1.0 (https://{DOMAIN})"
                ),
            )
            req.add_header("Accept", accept)
            try:
                with _urlopen_no_redirect(req, timeout=timeout) as resp:
                    status = getattr(resp, "status", 200)
                    content_type = resp.headers.get(
                        "Content-Type", "application/octet-stream"
                    )
                    chunks: list[bytes] = []
                    total = 0
                    while True:
                        piece = resp.read(64 * 1024)
                        if not piece:
                            break
                        total += len(piece)
                        if total > max_bytes:
                            raise ValueError("response too large")
                        chunks.append(piece)
                    return status, b"".join(chunks), content_type
            except urllib.error.HTTPError as exc:
                if 300 <= exc.code < 400:
                    loc = exc.headers.get("Location") if exc.headers else None
                    if not loc:
                        raise ValueError("redirect without location") from exc
                    current = urljoin(href, loc)
                    continue
                body = exc.read() if exc.fp else b""
                if len(body) > max_bytes:
                    raise ValueError("response too large") from exc
                ct = (
                    exc.headers.get("Content-Type", "application/octet-stream")
                    if exc.headers
                    else "application/octet-stream"
                )
                return exc.code, body, ct
        raise ValueError("too many redirects")

    def _proxy_custom_news_rss(self) -> None:
        if not self._custom_news_rate_ok():
            self._json(429, {"ok": False, "message": "rate limited"})
            return
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        href, err = _custom_news_validate_https_url(raw)
        if err or not href:
            self._json(400, {"ok": False, "message": err or "url required"})
            return
        try:
            status, body, content_type = self._fetch_public_https(
                href,
                accept="application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
                timeout=NEWS_RSS_TIMEOUT_SEC,
                max_bytes=CUSTOM_NEWS_RSS_MAX_BYTES,
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"custom news rss failed: {exc}"})
            return
        if status == 200 and not _custom_news_content_ok("rss", content_type, body):
            self._json(415, {"ok": False, "message": "not an RSS/Atom feed"})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=300")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _proxy_custom_news_article(self) -> None:
        if not self._custom_news_rate_ok():
            self._json(429, {"ok": False, "message": "rate limited"})
            return
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        href, err = _custom_news_validate_https_url(raw)
        if err or not href:
            self._json(400, {"ok": False, "message": err or "url required"})
            return
        try:
            status, body, content_type = self._fetch_public_https(
                href,
                accept="text/html,application/xhtml+xml,*/*",
                timeout=CUSTOM_NEWS_ARTICLE_TIMEOUT_SEC,
                max_bytes=CUSTOM_NEWS_HTML_MAX_BYTES,
            )
        except Exception as exc:  # noqa: BLE001
            self._json(
                502, {"ok": False, "message": f"custom news article failed: {exc}"}
            )
            return
        if status == 200 and not _custom_news_content_ok("html", content_type, body):
            self._json(415, {"ok": False, "message": "not an HTML page"})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=600")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _proxy_custom_news_media(self) -> None:
        if not self._custom_news_rate_ok():
            self._json(429, {"ok": False, "message": "rate limited"})
            return
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        raw = (qs.get("url") or [""])[0]
        href, err = _custom_news_validate_https_url(raw)
        if err or not href:
            self._json(400, {"ok": False, "message": err or "url required"})
            return
        allowed = [h.strip().lower() for h in (qs.get("allow") or []) if h.strip()]
        media_host = (urlparse(href).hostname or "").lower()
        if not allowed or media_host not in allowed:
            self._json(400, {"ok": False, "message": "media host not allowed"})
            return
        try:
            status, body, content_type = self._fetch_public_https(
                href,
                accept="image/*,*/*;q=0.8",
                timeout=CUSTOM_NEWS_MEDIA_TIMEOUT_SEC,
                max_bytes=CUSTOM_NEWS_MEDIA_MAX_BYTES,
            )
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "message": f"custom news media failed: {exc}"})
            return
        if status == 200 and not _custom_news_content_ok("image", content_type, body):
            self._json(415, {"ok": False, "message": "not an image"})
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _proxy_flayrah_rss(self) -> None:
        # Legacy path — Flayrah-only RSS with optional ?feed=.
        parsed = urlparse(self.path)
        feed_q = parse_qs(parsed.query).get("feed") or []
        feed = (feed_q[0] if feed_q else "full").strip().lower()
        self.path = f"/api/news/rss?source=flayrah&feed={feed}"
        self._proxy_news_rss()

    def _proxy_flayrah_article(self, node_id: str) -> None:
        self._proxy_news_article("flayrah", node_id)

    def _proxy_sofurry(self, path: str, parsed, method: str = "GET", body: bytes = b"") -> None:
        cookie = self._sofurry_cookies()

        # Media by absolute URL
        if path == "/api/sofurry/media-url" and method == "GET":
            params = parse_qs(parsed.query)
            target = (params.get("url") or [""])[0]
            host = (urlparse(target).hostname or "").lower()
            if host not in SOFURRY_MEDIA_HOSTS and not host.endswith(
                ".sofurryfiles.com"
            ):
                self._json(400, {"ok": False, "error": "URL host not allowed"})
                return
            resp_body, status, ct, _ = self._sofurry_request(
                target, cookie=cookie, accept="*/*", media=True
            )
            self._sofurry_respond(resp_body, status, ct)
            return

        # Media by CDN path
        if path.startswith("/api/sofurry/media/") and method == "GET":
            rel = path[len("/api/sofurry/media") :]
            candidates = [
                f"https://cdn.sofurryfiles.com{rel}",
                f"https://s3.sofurryfiles.com{rel}",
                f"{SOFURRY_BASE}{rel}",
            ]
            last = (b"not found", 404, "text/plain")
            for target in candidates:
                resp_body, status, ct, _ = self._sofurry_request(
                    target, cookie=cookie, accept="*/*", media=True
                )
                if 200 <= status < 300:
                    self._sofurry_respond(resp_body, status, ct)
                    return
                last = (resp_body, status, ct)
            self._sofurry_respond(*last)
            return

        upstream_path = path[len("/api/sofurry") :] or "/"
        if not upstream_path.startswith("/") or "://" in upstream_path or ".." in upstream_path:
            self._json(400, {"ok": False, "message": "bad path"})
            return
        qs = parsed.query
        url = f"{SOFURRY_BASE}{upstream_path}"
        if qs:
            url = f"{url}?{qs}"
        accept = (
            "application/json, text/x-script, */*"
            if ".data" in upstream_path
            else "application/json, text/html;q=0.8,*/*;q=0.5"
        )
        extra = {}
        if ".data" in upstream_path:
            extra = {
                "X-Inertia": "true",
                "X-Requested-With": "XMLHttpRequest",
            }
        # Soft likes/mutates need Remix `_session` + matching X-CSRF-Token.
        # Laravel `sofurry_session` alone is not enough — complete OAuth first.
        if method not in ("GET", "HEAD") and cookie:
            cookie = self._sofurry_upgrade_remix_session(cookie)
        ct_in = self.headers.get("Content-Type")
        resp_body, status, ct, _ = self._sofurry_request(
            url,
            method=method,
            cookie=cookie,
            body=body if method not in ("GET", "HEAD") else b"",
            content_type=ct_in,
            accept=accept,
            extra_headers=extra or None,
        )
        # Soft returns 403 for CSRF failures — only 401 means the session is dead.
        rejected = bool(cookie) and status == 401
        self._sofurry_respond(resp_body, status, ct, session_rejected=rejected)

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
        """Request Furbooru via curl_cffi (browser TLS + bot challenge).

        Furbooru returns HTTP 501 with a Philomena "I'm not a robot" form for
        urllib/Node fetch. furbooru_cf solves/caches `_philomena_key`.
        """
        del content_type  # upstream always gets application/json Accept
        try:
            import furbooru_cf
        except ImportError as exc:
            return (
                json.dumps({
                    "ok": False,
                    "message": (
                        "Furbooru proxy needs curl_cffi. "
                        "From the app directory: uv pip install -r requirements.txt "
                        f"({exc})"
                    ),
                }).encode(),
                501,
                "application/json",
            )
        try:
            return furbooru_cf.request(url, method=method, body=body, timeout=timeout)
        except ImportError as exc:
            return (
                json.dumps({
                    "ok": False,
                    "message": (
                        "Furbooru proxy needs curl_cffi. "
                        "From the app directory: uv pip install -r requirements.txt "
                        f"({exc})"
                    ),
                }).encode(),
                501,
                "application/json",
            )
        except Exception as exc:  # noqa: BLE001
            return (
                json.dumps({"ok": False, "message": str(exc)}).encode(),
                502,
                "application/json",
            )

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
        for key in ("q", "page", "per_page", "key", "sf", "sd", "filter_id"):
            v = _first(key)
            if v is not None:
                fwd[key] = v
        url = f"{FURBOORU_BASE}/api/v1/json/search/images?{urlencode(fwd)}"
        body, status, ct = self._furbooru_request(url)
        self._furbooru_respond(body, status, ct)

    def _proxy_furbooru_galleries(self, parsed) -> None:
        """GET /api/furbooru/galleries → /api/v1/json/search/galleries"""
        params = parse_qs(parsed.query)

        def _first(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        fwd = {}
        for key in ("q", "page", "per_page", "key", "sf", "sd"):
            v = _first(key)
            if v is not None:
                fwd[key] = v
        url = f"{FURBOORU_BASE}/api/v1/json/search/galleries?{urlencode(fwd)}"
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
        if path == NEWS_RSS_PATH or path == FLAYRAH_RSS_PATH:
            if path == FLAYRAH_RSS_PATH:
                self._proxy_flayrah_rss()
            else:
                self._proxy_news_rss()
            return
        if path == NEWS_CUSTOM_RSS_PATH:
            self._proxy_custom_news_rss()
            return
        if path == NEWS_CUSTOM_ARTICLE_PATH:
            self._proxy_custom_news_article()
            return
        if path == NEWS_CUSTOM_MEDIA_PATH:
            self._proxy_custom_news_media()
            return
        news_article = NEWS_ARTICLE_PATH.match(path)
        if news_article:
            self._proxy_news_article(news_article.group(1), news_article.group(2))
            return
        article_match = FLAYRAH_ARTICLE_PATH.match(path)
        if article_match:
            self._proxy_flayrah_article(article_match.group(1))
            return
        if path == "/api/git":
            if not _git_pull_enabled():
                self._json(200, {"pull_enabled": False, "branch": BRANCH, "running": False})
                return
            if self._authorized():
                self._json(200, _git_authed_status())
            else:
                self._json(200, _git_public_status())
            return
        if SCENT_MARKS_LIST_PATH.match(path):
            self._handle_scent_marks_get()
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
        if FURBOORU_GALLERIES_PATH.match(path):
            self._proxy_furbooru_galleries(parsed)
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
        if ITAKU_AUTH_PATH.match(path):
            self._proxy_itaku_get("auth/user/", parsed)
            return
        if ITAKU_FEED_PATH.match(path):
            self._proxy_itaku_get("feed/", parsed)
            return
        if ITAKU_STARS_PATH.match(path):
            self._proxy_itaku_get("galleries/images/user_starred_imgs/", parsed)
            return
        if ITAKU_TAGS_PATH.match(path):
            self._proxy_itaku_get("tags/", parsed)
            return
        if ITAKU_IMAGES_PATH.match(path):
            self._proxy_itaku_get("galleries/images/", parsed)
            return
        itaku_comments = ITAKU_COMMENTS_PATH.match(path)
        if itaku_comments:
            self._proxy_itaku_get(
                f"galleries/images/{itaku_comments.group(1)}/comments/", parsed
            )
            return
        itaku_image = ITAKU_IMAGE_PATH.match(path)
        if itaku_image:
            self._proxy_itaku_get(f"galleries/images/{itaku_image.group(1)}/", parsed)
            return
        itaku_user = ITAKU_USER_PATH.match(path)
        if itaku_user:
            self._proxy_itaku_get(
                f"user_profiles/{quote(itaku_user.group(1))}/", parsed
            )
            return
        itaku_post = ITAKU_POST_PATH.match(path)
        if itaku_post:
            self._proxy_itaku_get(f"posts/{itaku_post.group(1)}/", parsed)
            return
        if SOFURRY_PATH.match(path):
            self._proxy_sofurry(path, parsed, method="GET")
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
        scent_del = SCENT_MARK_ITEM_PATH.match(path)
        if scent_del:
            self._handle_scent_marks_delete(scent_del.group(1))
            return
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
        itaku_like = ITAKU_LIKE_PATH.match(path)
        if itaku_like:
            self._proxy_itaku_like("DELETE", itaku_like.group(1), parsed)
            return
        if SOFURRY_PATH.match(path):
            self._proxy_sofurry(path, parsed, method="DELETE")
            return
        self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""

        if SCENT_MARKS_AUTH_PATH.match(path):
            self._handle_scent_marks_auth()
            return

        scent_pin = SCENT_MARK_PIN_PATH.match(path)
        if scent_pin:
            self._handle_scent_marks_pin(scent_pin.group(1), body)
            return

        if SCENT_MARKS_LIST_PATH.match(path):
            self._handle_scent_marks_post(body)
            return

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

        itaku_like = ITAKU_LIKE_PATH.match(path)
        if itaku_like:
            self._proxy_itaku_like("POST", itaku_like.group(1), parsed, body)
            return

        itaku_comment = ITAKU_COMMENT_PATH.match(path)
        if itaku_comment:
            self._proxy_itaku_comment_create(itaku_comment.group(1), parsed, body)
            return

        if path in SOFURRY_AUTH_POSTS:
            if path == "/api/sofurry/login":
                self._proxy_sofurry_login(body)
            else:
                self._proxy_sofurry_login_cookies(body)
            return

        if SOFURRY_PATH.match(path):
            self._proxy_sofurry(path, parsed, method="POST", body=body)
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
        if not _git_pull_enabled():
            self._json(403, {"ok": False, "message": "git pull disabled on this host"})
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
    print(f"PawDeck serving {ROOT} on http://{HOST}:{PORT}", flush=True)
    print(f"PawDeck pull token file: {TOKEN_PATH}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
