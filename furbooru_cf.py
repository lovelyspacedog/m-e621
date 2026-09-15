"""Furbooru upstream fetch with browser TLS + Philomena bot challenge.

Furbooru returns HTTP 501 with a simple "I'm not a robot" form
(`POST /challenge` + `_key`) and sets `_philomena_key`. Plain urllib/Node
fetch hit that wall; curl_cffi + solving/caching the challenge clears it
for the m-e621 Furbooru proxy.
"""
from __future__ import annotations

import base64
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

FURBOORU_ORIGIN = "https://furbooru.org"
FURBOORU_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)
COOKIE_NAME = "_philomena_key"
# Prefer fingerprints that currently pass Furbooru TLS checks.
IMPERSONATIONS = (
    "chrome136",
    "chrome120",
    "firefox135",
    "safari17_0",
)
_KEY_RE = re.compile(r'name="_key"\s+value="([^"]+)"', re.I)
# Persist cookie across vite's per-request python CLI invocations.
_COOKIE_PATH = Path(__file__).resolve().parent / ".furbooru_philomena_key"
_COOKIE_MAX_AGE_S = 60 * 60 * 12  # refresh at least twice a day

_cached_cookie: str | None = None
_cached_impersonate: str | None = None


def _browser_headers(*, accept: str = "application/json") -> dict[str, str]:
    return {
        "Accept": accept,
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": FURBOORU_UA,
        "Referer": f"{FURBOORU_ORIGIN}/",
        "Origin": FURBOORU_ORIGIN,
    }


def _is_challenge(status: int, body: bytes) -> bool:
    if status != 501:
        return False
    head = body[:800]
    return b"fur-challenge" in head or b"Attention Required" in head


def _load_cookie() -> str | None:
    global _cached_cookie
    if _cached_cookie:
        return _cached_cookie
    try:
        raw = _COOKIE_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not raw:
        return None
    # Optional "epoch cookie" format for expiry; bare cookie still accepted.
    if " " in raw:
        ts_s, cookie = raw.split(" ", 1)
        try:
            if time.time() - float(ts_s) > _COOKIE_MAX_AGE_S:
                return None
        except ValueError:
            cookie = raw
    else:
        cookie = raw
    _cached_cookie = cookie
    return cookie


def _save_cookie(cookie: str) -> None:
    global _cached_cookie
    _cached_cookie = cookie
    try:
        _COOKIE_PATH.write_text(f"{time.time():.0f} {cookie}\n", encoding="utf-8")
    except OSError:
        pass


def _clear_cookie() -> None:
    global _cached_cookie
    _cached_cookie = None
    try:
        _COOKIE_PATH.unlink(missing_ok=True)
    except OSError:
        pass


def _extract_challenge_key(html: bytes | str) -> str | None:
    text = html.decode("utf-8", errors="ignore") if isinstance(html, bytes) else html
    m = _KEY_RE.search(text)
    return m.group(1) if m else None


def _solve_challenge(session: Any, challenge_body: bytes) -> str | None:
    """POST /challenge with _key from a 501 page; return _philomena_key or None."""
    key = _extract_challenge_key(challenge_body)
    if not key:
        # Challenge HTML sometimes only on `/`; fetch that.
        warm = session.get(
            f"{FURBOORU_ORIGIN}/",
            headers=_browser_headers(accept="text/html,application/xhtml+xml,*/*;q=0.8"),
            timeout=30,
        )
        key = _extract_challenge_key(warm.content)
        if not key:
            return None
    resp = session.post(
        f"{FURBOORU_ORIGIN}/challenge",
        data={"_key": key},
        headers={
            **_browser_headers(accept="text/html,application/xhtml+xml,*/*;q=0.8"),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout=30,
        allow_redirects=True,
    )
    cookie = session.cookies.get(COOKIE_NAME)
    if cookie:
        _save_cookie(str(cookie))
        return str(cookie)
    # Some builds expose cookies only via jar iteration.
    try:
        for c in session.cookies:
            name = getattr(c, "name", None) or (c[0] if isinstance(c, tuple) else None)
            val = getattr(c, "value", None) or (c[1] if isinstance(c, tuple) else None)
            if name == COOKIE_NAME and val:
                _save_cookie(str(val))
                return str(val)
    except Exception:  # noqa: BLE001
        pass
    set_cookie = resp.headers.get("Set-Cookie") or resp.headers.get("set-cookie") or ""
    m = re.search(rf"{re.escape(COOKIE_NAME)}=([^;]+)", set_cookie)
    if m:
        _save_cookie(m.group(1))
        return m.group(1)
    return None


def _session(impersonate: str, cookie: str | None) -> Any:
    from curl_cffi import requests as cffi_requests  # type: ignore

    sess = cffi_requests.Session(impersonate=impersonate)
    if cookie:
        sess.cookies.set(COOKIE_NAME, cookie)
    return sess


def request(
    url: str,
    *,
    method: str = "GET",
    body: bytes = b"",
    timeout: float = 30,
) -> tuple[bytes, int, str]:
    """Return (body, status, content_type). Raises ImportError if curl_cffi missing."""
    from curl_cffi import requests as cffi_requests  # type: ignore

    del cffi_requests  # imported for ImportError; Session used via _session
    global _cached_impersonate

    cookie = _load_cookie()
    last_status = 502
    last_body = b'{"ok":false,"message":"Furbooru request failed"}'
    last_ct = "application/json"
    impersonations = (
        (_cached_impersonate,) + IMPERSONATIONS
        if _cached_impersonate
        else IMPERSONATIONS
    )
    # Dedupe while preserving order.
    seen: set[str] = set()
    impersonations = tuple(i for i in impersonations if i and not (i in seen or seen.add(i)))

    for impersonate in impersonations:
        try:
            sess = _session(impersonate, cookie)
            resp = sess.request(
                method.upper(),
                url,
                data=body if body else None,
                headers=_browser_headers(),
                timeout=timeout,
            )
            ct = resp.headers.get("Content-Type") or "application/json"
            if _is_challenge(resp.status_code, resp.content):
                last_status = resp.status_code
                last_body = resp.content
                last_ct = ct
                solved = _solve_challenge(sess, resp.content)
                if not solved:
                    continue
                cookie = solved
                _cached_impersonate = impersonate
                resp = sess.request(
                    method.upper(),
                    url,
                    data=body if body else None,
                    headers=_browser_headers(),
                    timeout=timeout,
                )
                ct = resp.headers.get("Content-Type") or "application/json"
                if _is_challenge(resp.status_code, resp.content):
                    _clear_cookie()
                    cookie = None
                    last_status = resp.status_code
                    last_body = resp.content
                    last_ct = ct
                    continue
            _cached_impersonate = impersonate
            if COOKIE_NAME in getattr(sess, "cookies", {}):
                try:
                    _save_cookie(str(sess.cookies.get(COOKIE_NAME)))
                except Exception:  # noqa: BLE001
                    pass
            return resp.content, int(resp.status_code), ct
        except ImportError:
            raise
        except Exception as exc:  # noqa: BLE001
            last_status = 502
            last_body = json.dumps({"ok": False, "message": str(exc)}).encode()
            last_ct = "application/json"
    return last_body, last_status, last_ct


def main(argv: list[str] | None = None) -> int:
    """CLI: stdin JSON {url,method?,body_b64?} → stdout JSON {status,content_type,body_b64}."""
    del argv  # unused; kept for symmetry with other CLIs
    raw = sys.stdin.buffer.read()
    try:
        spec: dict[str, Any] = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        sys.stdout.write(
            json.dumps({
                "status": 400,
                "content_type": "application/json",
                "body_b64": base64.b64encode(
                    json.dumps({"ok": False, "message": f"invalid json: {exc}"}).encode()
                ).decode(),
            })
        )
        return 0
    url = str(spec.get("url") or "")
    if not url:
        sys.stdout.write(
            json.dumps({
                "status": 400,
                "content_type": "application/json",
                "body_b64": base64.b64encode(
                    b'{"ok":false,"message":"url required"}'
                ).decode(),
            })
        )
        return 0
    method = str(spec.get("method") or "GET")
    body_b64 = spec.get("body_b64")
    body = base64.b64decode(body_b64) if body_b64 else b""
    try:
        data, status, ct = request(url, method=method, body=body)
    except ImportError as exc:
        data = json.dumps({
            "ok": False,
            "message": (
                "Furbooru proxy needs curl_cffi. "
                "From the app directory: uv pip install -r requirements.txt "
                f"({exc})"
            ),
        }).encode()
        status, ct = 501, "application/json"
    sys.stdout.write(
        json.dumps({
            "status": status,
            "content_type": ct,
            "body_b64": base64.b64encode(data).decode(),
        })
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
