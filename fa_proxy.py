"""Fur Affinity JSON API used by serve.py (/api/furaffinity/*).

Embeds faapi for gallery/submission/favorites/journals/watchlist/me.
Scrapes /search/ and /browse/ directly, and toggles /fav/|/unfav/, bypassing
robots Disallow for those paths on purpose. Cookies come from the request
body, then FA_COOKIE_A/B env.
"""
from __future__ import annotations

import html as html_lib
import json
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote, urljoin, urlparse

import faapi
from faapi.comment import flatten_comments
from faapi.connection import root as FA_ROOT
from faapi.parse import parse_page, parse_submission_figure, parse_submission_figures

_LOCK = threading.Lock()
_APIS: dict[str, faapi.FAAPI] = {}
_GUEST_COOKIES: list[dict[str, str]] | None = None

ACTIONS = frozenset(
    {
        "login",
        "me",
        "frontpage",
        "browse",
        "search",
        "gallery",
        "scraps",
        "favorites",
        "journals",
        "submission",
        "journal",
        "watchlist",
        "submissions",
        "favorite",
        "unfavorite",
        "comment",
    }
)


class FaProxyError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _env_cookies() -> list[dict[str, str]]:
    cookies: list[dict[str, str]] = []
    a = os.environ.get("FA_COOKIE_A", "").strip()
    b = os.environ.get("FA_COOKIE_B", "").strip()
    if a:
        cookies.append({"name": "a", "value": a})
    if b:
        cookies.append({"name": "b", "value": b})
    return cookies


def parse_cookie_string(raw: str | None) -> list[dict[str, str]]:
    if not raw or not str(raw).strip():
        return []
    out: list[dict[str, str]] = []
    for part in str(raw).split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        name = name.strip()
        value = value.strip()
        if name and value:
            out.append({"name": name, "value": value})
    return out


def cookie_string(cookies: list[dict[str, str]]) -> str:
    return ";".join(f"{c['name']}={c['value']}" for c in cookies if c.get("name") and c.get("value"))


def _guest_cookies() -> list[dict[str, str]]:
    global _GUEST_COOKIES
    if _GUEST_COOKIES:
        return _GUEST_COOKIES
    import requests

    session = requests.Session()
    session.headers["User-Agent"] = (
        f"faapi/{getattr(faapi, '__version__', '3.12.7')} m-e621-furaffinity-proxy"
    )
    session.get(FA_ROOT + "/", timeout=30)
    cookies = [
        {"name": c.name, "value": c.value or ""}
        for c in session.cookies
        if c.name in {"a", "b"} and c.value
    ]
    if not cookies:
        raise FaProxyError(
            "Could not establish a guest FurAffinity session",
            502,
        )
    _GUEST_COOKIES = cookies
    return cookies


def resolve_cookies(payload: dict[str, Any]) -> list[dict[str, str]]:
    """Profile cookies win, then host FA_COOKIE_*, then guest session."""
    cookies, _source = resolve_cookies_with_source(payload)
    return cookies


def resolve_cookies_with_source(
    payload: dict[str, Any],
) -> tuple[list[dict[str, str]], str]:
    cookies = parse_cookie_string(payload.get("cookies"))
    if cookies:
        return cookies, "profile"
    env = _env_cookies()
    if env:
        return env, "env"
    return _guest_cookies(), "guest"


def _api_for(cookies: list[dict[str, str]]) -> faapi.FAAPI:
    key = cookie_string(cookies)
    api = _APIS.get(key)
    if api is None:
        api = faapi.FAAPI(cookies)
        api.timeout = 45
        _APIS[key] = api
    return api


def _abs_url(url: str | None) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return urljoin(FA_ROOT + "/", url.lstrip("/"))
    return url


def _iso(value: Any) -> str:
    """Serialize datetimes as UTC ISO with an offset.

    faapi builds naive locals via ``datetime.fromtimestamp(unix)``. Emitting
    those without a tz marker makes UTC hosts look ~4h in the future to EDT
    clients (date-fns parseISO treats offset-less strings as local).
    """
    if value is None:
        return ""
    if isinstance(value, datetime):
        try:
            if value.tzinfo is None:
                value = datetime.fromtimestamp(value.timestamp(), tz=timezone.utc)
            else:
                value = value.astimezone(timezone.utc)
            return value.isoformat()
        except (OverflowError, OSError, ValueError):
            return str(value)
    iso = getattr(value, "isoformat", None)
    if callable(iso):
        try:
            return iso()
        except Exception:
            return str(value)
    return str(value)


def _date_from_fa_url(url: str | None) -> str:
    """FA CDN thumbs embed unix time: …/id@200-1789446690.jpg"""
    if not url:
        return ""
    decoded = unquote(url)
    match = re.search(r"@\d+-(\d{9,})\.", decoded) or re.search(
        r"/(\d{9,})/\1\.", decoded
    )
    if not match:
        return ""
    try:
        return datetime.fromtimestamp(int(match.group(1)), tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return ""


def _dims_from_figure(figure: Any) -> tuple[int, int]:
    img = getattr(figure, "select_one", lambda _s: None)("img")
    if img is None:
        return 0, 0
    try:
        width = int(round(float(img.get("data-width") or 0)))
        height = int(round(float(img.get("data-height") or 0)))
    except (TypeError, ValueError):
        return 0, 0
    return max(0, width), max(0, height)


def _parse_byte_size(text: str) -> int:
    """Parse strings like '1.48 MB', '512 KB', '1234 B' into bytes."""
    match = re.search(
        r"([\d.,]+)\s*(Ki?B|Mi?B|Gi?B|B)\b",
        text or "",
        flags=re.IGNORECASE,
    )
    if not match:
        return 0
    try:
        raw = match.group(1).replace(",", "")
        n = float(raw)
    except ValueError:
        return 0
    unit = match.group(2).upper().replace("I", "")
    mult = {"B": 1, "KB": 1000, "MB": 1000**2, "GB": 1000**3}.get(unit, 0)
    if mult <= 0 or n <= 0:
        return 0
    return int(round(n * mult))


def _file_meta_from_submission_page(page: Any) -> tuple[int, int, int]:
    """
    Detail Submission objects have no gallery figure — pull dims/size from
    #submissionImg and .submission-content-stats when present.
    """
    if page is None or not hasattr(page, "select_one"):
        return 0, 0, 0
    width = height = size = 0
    img = page.select_one("img#submissionImg")
    if img is not None:
        try:
            width = int(round(float(img.get("data-width") or 0)))
            height = int(round(float(img.get("data-height") or 0)))
        except (TypeError, ValueError):
            width = height = 0
    stats = page.select_one(".submission-content-stats")
    stats_text = stats.get_text(" ", strip=True) if stats is not None else ""
    if (width <= 0 or height <= 0) and stats_text:
        dim = re.search(r"(\d+)\s*[x×]\s*(\d+)", stats_text, flags=re.IGNORECASE)
        if dim:
            try:
                width = max(width, int(dim.group(1)))
                height = max(height, int(dim.group(2)))
            except ValueError:
                pass
    if stats_text:
        size = _parse_byte_size(stats_text)
    if size <= 0:
        # Fallback: any size-like token near download / info blocks.
        for node in page.select(
            ".submission-content-stats span, #submissionInfo, .classic-submission-info"
        ):
            size = _parse_byte_size(node.get_text(" ", strip=True))
            if size > 0:
                break
    return max(0, width), max(0, height), max(0, size)


def _html_text(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        from bs4 import BeautifulSoup

        text = BeautifulSoup(raw, "lxml").get_text("\n", strip=True)
    except Exception:
        text = raw
    return html_lib.unescape(text).strip()


def _user_partial(user: Any) -> dict[str, Any]:
    if not user:
        return {"name": "", "status": "", "title": "", "avatar_url": ""}
    return {
        "name": getattr(user, "name", "") or "",
        "status": getattr(user, "status", "") or "",
        "title": getattr(user, "title", "") or "",
        "avatar_url": _abs_url(getattr(user, "avatar_url", "") or ""),
    }


def serialize_partial(sub: Any) -> dict[str, Any]:
    if isinstance(sub, dict):
        raw_author = sub.get("author")
        if isinstance(raw_author, dict):
            author = {
                "name": raw_author.get("name") or "",
                "status": raw_author.get("status") or "",
                "title": raw_author.get("title") or "",
                "avatar_url": _abs_url(raw_author.get("avatar_url") or ""),
            }
        else:
            author = {"name": raw_author or "", "status": "", "title": "", "avatar_url": ""}
        thumb = _abs_url(sub.get("thumbnail_url") or "")
        out: dict[str, Any] = {
            "id": int(sub.get("id") or 0),
            "title": sub.get("title") or "",
            "author": author,
            "rating": (sub.get("rating") or "general").lower(),
            "type": (sub.get("type") or "image").lower(),
            "thumbnail_url": thumb,
            "kind": sub.get("kind") or "submission",
        }
        date = sub.get("date") or _date_from_fa_url(thumb) or _date_from_fa_url(sub.get("file_url"))
        if date:
            out["date"] = date
        width = int(sub.get("width") or 0)
        height = int(sub.get("height") or 0)
        if width > 0:
            out["width"] = width
        if height > 0:
            out["height"] = height
        return out
    thumb = _abs_url(getattr(sub, "thumbnail_url", "") or "")
    figure = getattr(sub, "submission_figure", None)
    width, height = _dims_from_figure(figure) if figure is not None else (0, 0)
    out = {
        "id": int(getattr(sub, "id", 0) or 0),
        "title": getattr(sub, "title", "") or "",
        "author": _user_partial(getattr(sub, "author", None)),
        "rating": (getattr(sub, "rating", "") or "general").lower(),
        "type": (getattr(sub, "type", "") or "image").lower(),
        "thumbnail_url": thumb,
        "kind": "submission",
    }
    date = _date_from_fa_url(thumb)
    if date:
        out["date"] = date
    if width > 0:
        out["width"] = width
    if height > 0:
        out["height"] = height
    return out


def serialize_submission(sub: Any) -> dict[str, Any]:
    stats = getattr(sub, "stats", None)
    comments = []
    try:
        comments = [
            {
                "id": int(c.id),
                "created_at": _iso(c.date),
                "post_id": int(sub.id),
                "creator_id": 0,
                "body": _html_text(c.text),
                "score": 0,
                "updated_at": _iso(c.date),
                "updater_id": 0,
                "do_not_bump_post": False,
                "is_hidden": bool(getattr(c, "hidden", False)),
                "is_sticky": False,
                "creator_name": getattr(getattr(c, "author", None), "name", "") or "",
                "updater_name": getattr(getattr(c, "author", None), "name", "") or "",
            }
            for c in flatten_comments(list(getattr(sub, "comments", None) or []))
        ]
    except Exception:
        comments = []
    page = getattr(sub, "submission_page", None)
    width, height, size = _file_meta_from_submission_page(page)
    out = {
        **serialize_partial(sub),
        "date": _iso(getattr(sub, "date", None))
        or _date_from_fa_url(getattr(sub, "file_url", None))
        or _date_from_fa_url(getattr(sub, "thumbnail_url", None)),
        "tags": list(getattr(sub, "tags", None) or []),
        "category": getattr(sub, "category", "") or "",
        "species": getattr(sub, "species", "") or "",
        "description": _html_text(getattr(sub, "description", "") or ""),
        "file_url": _abs_url(getattr(sub, "file_url", "") or ""),
        "thumbnail_url": _abs_url(getattr(sub, "thumbnail_url", "") or ""),
        "views": int(getattr(stats, "views", 0) or 0),
        "comment_count": int(getattr(stats, "comments", 0) or 0),
        "favorites": int(getattr(stats, "favorites", 0) or 0),
        "favorite": bool(getattr(sub, "favorite", False)),
        "favorite_toggle_link": getattr(sub, "favorite_toggle_link", "") or "",
        "comments": comments,
        "details": True,
    }
    if width > 0:
        out["width"] = width
    if height > 0:
        out["height"] = height
    if size > 0:
        out["size"] = size
    return out


def serialize_journal(journal: Any) -> dict[str, Any]:
    stats = getattr(journal, "stats", None)
    comments_n = int(getattr(stats, "comments", 0) or 0)
    return {
        "id": int(getattr(journal, "id", 0) or 0),
        "title": getattr(journal, "title", "") or "",
        "author": _user_partial(getattr(journal, "author", None)),
        "rating": (getattr(journal, "rating", "") or "general").lower(),
        "type": "text",
        "thumbnail_url": "",
        "kind": "journal",
        "date": _iso(getattr(journal, "date", None)),
        "description": _html_text(getattr(journal, "content", "") or ""),
        "comment_count": comments_n,
        "details": True,
    }


def _figures_from_html(text: str) -> tuple[list[dict[str, Any]], bool]:
    page = parse_page(text)
    out: list[dict[str, Any]] = []
    for figure in parse_submission_figures(page):
        try:
            parsed = parse_submission_figure(figure)
            width, height = _dims_from_figure(figure)
            thumb = parsed["thumbnail_url"]
            payload: dict[str, Any] = {
                "id": parsed["id"],
                "title": parsed["title"],
                "author": {"name": parsed["author"]},
                "rating": parsed["rating"],
                "type": parsed["type"],
                "thumbnail_url": thumb,
            }
            date = _date_from_fa_url(thumb)
            if date:
                payload["date"] = date
            if width > 0:
                payload["width"] = width
            if height > 0:
                payload["height"] = height
            out.append(serialize_partial(payload))
        except Exception:
            continue
    has_next = any(
        (b.text or "").strip().lower() == "next"
        for b in page.select("form button.button, a.button")
    )
    return out, has_next


def _session_get(api: faapi.FAAPI, path: str, **params: Any):
    api.handle_delay()
    url = path if path.startswith("http") else f"{FA_ROOT}/{path.lstrip('/')}"
    return api.session.get(url, params=params or None, timeout=api.timeout)


def _session_post(api: faapi.FAAPI, path: str, data: dict[str, Any]):
    api.handle_delay()
    url = path if path.startswith("http") else f"{FA_ROOT}/{path.lstrip('/')}"
    return api.session.post(url, data=data, timeout=api.timeout)


def _login(username: str, password: str) -> dict[str, Any]:
    import requests

    if not username or not password:
        raise FaProxyError("username and password required", 400)
    session = requests.Session()
    session.headers["User-Agent"] = (
        f"faapi/{getattr(faapi, '__version__', '3.12.7')} m-e621-furaffinity-proxy"
    )
    session.get(f"{FA_ROOT}/login/", timeout=45)
    resp = session.post(
        f"{FA_ROOT}/login/",
        data={
            "action": "login",
            "name": username,
            "pass": password,
            "retard_protection": "1",
        },
        timeout=45,
        allow_redirects=True,
    )
    text = resp.text.lower()
    if "captcha" in text or "cloudflare" in text and "challenge" in text:
        raise FaProxyError(
            "FurAffinity login needs a captcha/challenge. Set FA_COOKIE_A and FA_COOKIE_B on the server instead.",
            403,
        )
    cookies = [
        {"name": c.name, "value": c.value or ""}
        for c in session.cookies
        if c.name in {"a", "b"} and c.value
    ]
    if not any(c["name"] == "b" for c in cookies):
        raise FaProxyError("FurAffinity login failed (check username/password)", 401)
    api = _api_for(cookies)
    me = api.me()
    name = getattr(me, "name", None) or username
    return {"username": name, "cookies": cookie_string(cookies)}


def _me(api: faapi.FAAPI, cookie_source: str = "unknown") -> dict[str, Any]:
    user = api.me()
    if user is None:
        raise FaProxyError("Not logged in to FurAffinity", 401)
    return {
        "username": user.name,
        "title": user.title,
        "avatar_url": _abs_url(user.avatar_url),
        "env": bool(_env_cookies()),
        # profile | env | guest — profile overrides host FA_COOKIE_*
        "cookieSource": cookie_source,
    }


def _search(api: faapi.FAAPI, payload: dict[str, Any]) -> dict[str, Any]:
    q = str(payload.get("q") or "").strip()
    page = max(1, int(payload.get("page") or 1))
    order_by = str(payload.get("order_by") or "date")
    if order_by not in {"date", "relevancy", "popularity"}:
        order_by = "date"
    order_direction = str(payload.get("order_direction") or "desc")
    if order_direction not in {"asc", "desc"}:
        order_direction = "desc"
    ratings = payload.get("ratings") or ["general", "mature", "adult"]
    if not isinstance(ratings, list) or not ratings:
        ratings = ["general", "mature", "adult"]
    data: dict[str, Any] = {
        "q": q,
        "page": str(page),
        "perpage": "72",
        "order-by": order_by,
        "order-direction": order_direction,
        "range": "all",
        "mode": "extended",
        "do_search": "Search",
    }
    for rating in ratings:
        data[f"rating-{rating}"] = "on"
    types = payload.get("types") or ["art", "music", "flash", "story", "photo", "poetry"]
    if not isinstance(types, list) or not types:
        types = ["art", "music", "flash", "story", "photo", "poetry"]
    for kind in types:
        data[f"type-{kind}"] = "on"
    resp = _session_post(api, "search/", data)
    if resp.status_code >= 400:
        raise FaProxyError(f"FurAffinity search failed ({resp.status_code})", resp.status_code)
    results, has_next = _figures_from_html(resp.text)
    return {"results": results, "next": page + 1 if has_next else None, "page": page}


def _browse(api: faapi.FAAPI, payload: dict[str, Any]) -> dict[str, Any]:
    page = max(1, int(payload.get("page") or 1))
    resp = _session_get(api, f"browse/{page}/")
    if resp.status_code >= 400:
        if page == 1:
            results = [serialize_partial(s) for s in api.frontpage()]
            return {"results": results, "next": None, "page": 1}
        raise FaProxyError(f"FurAffinity browse failed ({resp.status_code})", resp.status_code)
    results, has_next = _figures_from_html(resp.text)
    return {"results": results, "next": page + 1 if has_next else None, "page": page}


def _submissions_feed(api: faapi.FAAPI, payload: dict[str, Any]) -> dict[str, Any]:
    """Logged-in watchstream: /msg/submissions/."""
    page = max(1, int(payload.get("page") or 1))
    path = "msg/submissions/" if page <= 1 else f"msg/submissions/{page}/"
    resp = _session_get(api, path)
    if resp.status_code in (401, 403):
        raise FaProxyError(
            "Log in to FurAffinity to view your following feed",
            resp.status_code,
        )
    if resp.status_code >= 400:
        raise FaProxyError(
            f"FurAffinity submissions feed failed ({resp.status_code})",
            resp.status_code,
        )
    results, has_next = _figures_from_html(resp.text)
    return {"results": results, "next": page + 1 if has_next else None, "page": page}


def _folder(api: faapi.FAAPI, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    username = str(payload.get("username") or "").strip()
    if not username:
        raise FaProxyError("username required", 400)
    page = payload.get("page") or 1
    if kind == "favorites":
        token = "" if page in (1, "1", None, "") else str(page)
        items, nxt = api.favorites(username, token)
        return {
            "results": [serialize_partial(s) for s in items],
            "next": nxt,
            "page": token or "",
        }
    page_n = max(1, int(page or 1))
    if kind == "gallery":
        items, nxt = api.gallery(username, page_n)
    elif kind == "scraps":
        items, nxt = api.scraps(username, page_n)
    else:
        items, nxt = api.journals(username, page_n)
        return {
            "results": [serialize_journal(j) for j in items],
            "next": nxt,
            "page": page_n,
        }
    return {
        "results": [serialize_partial(s) for s in items],
        "next": nxt,
        "page": page_n,
    }


def _set_favorite(api: faapi.FAAPI, payload: dict[str, Any], want: bool) -> dict[str, Any]:
    sid = int(payload.get("id") or 0)
    if not sid:
        raise FaProxyError("id required", 400)
    sub, _ = api.submission(sid)
    if bool(sub.favorite) == want:
        return {"ok": True, "favorite": bool(sub.favorite)}
    link = sub.favorite_toggle_link or ""
    if not link:
        raise FaProxyError("No favorite toggle link (login required?)", 401)
    path = urlparse(link).path.lstrip("/")
    # faapi.api.get() honors robots.txt; FA Disallow:/fav/|/unfav/ is for crawlers.
    _session_get(api, path)
    return {"ok": True, "favorite": want}


def _comment(api: faapi.FAAPI, payload: dict[str, Any]) -> dict[str, Any]:
    sid = int(payload.get("id") or 0)
    body = str(payload.get("body") or "").strip()
    if not sid or not body:
        raise FaProxyError("id and body required", 400)
    page = api.get_parsed(f"view/{sid}")
    textarea = page.select_one("textarea[name='reply']")
    form = textarea.find_parent("form") if textarea else None
    if form is None:
        raise FaProxyError("Could not find FurAffinity comment form", 502)
    data: dict[str, str] = {}
    for inp in form.select("input"):
        name = inp.get("name")
        if name:
            data[str(name)] = str(inp.get("value") or "")
    data["reply"] = body
    action = str(form.get("action") or f"/view/{sid}/")
    resp = _session_post(api, action, data)
    if resp.status_code >= 400:
        raise FaProxyError(f"Comment failed ({resp.status_code})", resp.status_code)
    return {"ok": True}


def handle(action: str, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    payload = payload or {}
    if action not in ACTIONS:
        return 404, {"ok": False, "message": "not found"}
    try:
        with _LOCK:
            if action == "login":
                return 200, _login(str(payload.get("username") or ""), str(payload.get("password") or ""))
            cookies, cookie_source = resolve_cookies_with_source(payload)
            api = _api_for(cookies)
            if action == "me":
                return 200, _me(api, cookie_source)
            if action == "frontpage":
                return 200, {"results": [serialize_partial(s) for s in api.frontpage()], "next": None}
            if action == "browse":
                return 200, _browse(api, payload)
            if action == "submissions":
                return 200, _submissions_feed(api, payload)
            if action == "search":
                return 200, _search(api, payload)
            if action in {"gallery", "scraps", "favorites", "journals"}:
                return 200, _folder(api, action, payload)
            if action == "submission":
                sid = int(payload.get("id") or 0)
                if not sid:
                    raise FaProxyError("id required", 400)
                sub, _ = api.submission(sid)
                return 200, serialize_submission(sub)
            if action == "journal":
                jid = int(payload.get("id") or 0)
                if not jid:
                    raise FaProxyError("id required", 400)
                return 200, serialize_journal(api.journal(jid))
            if action == "watchlist":
                username = str(payload.get("username") or "").strip()
                if not username:
                    me = api.me()
                    if me is None:
                        raise FaProxyError("username required", 400)
                    username = me.name
                page = max(1, int(payload.get("page") or 1))
                users, nxt = api.watchlist_by(username, page)
                return 200, {
                    "results": [{"name": u.name, "status": u.status} for u in users],
                    "next": nxt,
                }
            if action == "favorite":
                return 200, _set_favorite(api, payload, True)
            if action == "unfavorite":
                return 200, _set_favorite(api, payload, False)
            if action == "comment":
                return 200, _comment(api, payload)
            return 404, {"ok": False, "message": "not found"}
    except FaProxyError as exc:
        return exc.status, {"ok": False, "message": str(exc)}
    except Exception as exc:  # noqa: BLE001
        name = type(exc).__name__
        return 502, {"ok": False, "message": f"{name}: {exc}"}


def dumps(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload).encode("utf-8")
