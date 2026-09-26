"""u18chan HTML scrape helpers for serve.py (mirrors vite-u18chan-proxy.ts)."""

from __future__ import annotations

import html as html_lib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

U18CHAN_BASE = "https://u18chan.com"
UA = "me621-u18chan-proxy/1.0"

# Index boards → live boards. Cub intentionally omitted.
INDEX_TO_LIVE = {
    "ifur": "fur",
    "ic": "c",
    "igfur": "gfur",
    "igc": "gc",
    "ii": "i",
    "ia": "a",
    "ip": "p",
    "if": "f",
    "igore": "gore",
}
ALLOWED_INDEX = frozenset(INDEX_TO_LIVE)
ALLOWED_LIVE = frozenset(INDEX_TO_LIVE.values())
BLOCKED = frozenset({"icub", "cub"})

_ITEM_RE = re.compile(
    r'<div class="item">\s*<div class="Subject">(.*?)</(?:div|a)>\s*'
    r'<div class="layoutHeight"><a class="thumbnail_link" '
    r'href="(https?://u18chan\.com/([^/"\']+)/topic/(\d+))"[^>]*>\s*'
    r'<img[^>]+src="([^"]+)"',
    re.I | re.S,
)


def is_blocked(board: str) -> bool:
    return board.lower() in BLOCKED


def assert_board_allowed(board: str) -> None:
    b = board.lower()
    if is_blocked(b):
        raise ValueError("board not allowed")
    if b not in ALLOWED_INDEX and b not in ALLOWED_LIVE:
        raise ValueError(f"unknown board: {board}")


def _strip_tags(raw: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", raw or "", flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return html_lib.unescape(text).strip()


def media_proxy_url(upstream: str) -> str:
    return "/api/u18chan/media?url=" + urllib.parse.quote(upstream, safe="")


def rewrite_media(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    if u.startswith("//"):
        u = "https:" + u
    if not u.startswith("http"):
        return None
    try:
        parsed = urllib.parse.urlparse(u)
    except Exception:
        return None
    host = (parsed.hostname or "").lower()
    if not host.endswith("u18chan.com"):
        return None
    return media_proxy_url(urllib.parse.urlunparse(parsed))


def fetch_html(url: str, timeout: float = 45.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,*/*",
            "Referer": U18CHAN_BASE + "/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_catalog(html: str) -> list[dict[str, Any]]:
    threads: list[dict[str, Any]] = []
    for m in _ITEM_RE.finditer(html):
        live = m.group(3).lower()
        if is_blocked(live):
            continue
        threads.append(
            {
                "id": int(m.group(4)),
                "liveBoard": live,
                "subject": _strip_tags(m.group(1)) or "No Subject",
                "thumbUrl": rewrite_media(m.group(5)),
                "href": m.group(2),
            }
        )
    return threads


def _parse_post_chunk(pid: str, chunk: str, is_op: bool) -> dict[str, Any]:
    name_m = re.search(r'class="UserName">(.*?)</span>', chunk, re.S)
    subj_m = re.search(r'class="Subject">(.*?)</span>', chunk, re.S)
    date_m = re.search(r"</span>\s*([\d/]+\s+[\d:]+)", chunk)
    comment = ""
    msg_m = re.search(rf'id="post_{pid}_message_div">(.*?)</span>', chunk, re.S)
    if msg_m:
        comment = _strip_tags(msg_m.group(1))
    if not comment:
        edit = re.search(
            rf"EditPost\({pid},\s*'((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)',"
            rf"\s*'((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)'",
            chunk,
        )
        if edit:
            comment = html_lib.unescape(edit.group(4).replace("\\'", "'"))
    images: list[dict[str, str]] = []
    for im in re.finditer(
        rf'<a href="(https://u18chan\.com/uploads/data/[^"]+)"[^>]*>\s*'
        rf'<img[^>]*id="post_{pid}_image"[^>]*(?:data-original="([^"]*)")?',
        chunk,
        re.I | re.S,
    ):
        full = rewrite_media(im.group(1)) or im.group(1)
        thumb = rewrite_media(im.group(2) or im.group(1)) or full
        images.append({"fullUrl": full, "thumbUrl": thumb})
    if not images:
        lazy = re.search(
            rf'<img[^>]*id="post_{pid}_image"[^>]*data-original="([^"]+)"',
            chunk,
            re.I,
        )
        if lazy:
            thumb = rewrite_media(lazy.group(1)) or lazy.group(1)
            images.append({"fullUrl": thumb, "thumbUrl": thumb})
    return {
        "id": int(pid),
        "name": _strip_tags(name_m.group(1)) if name_m else "Anonymous",
        "subject": _strip_tags(subj_m.group(1)) if subj_m else "",
        "timestamp": date_m.group(1).strip() if date_m else "",
        "comment": comment,
        "images": images,
        "isOp": is_op,
    }


def parse_thread(
    html: str, live_board: str, topic_id: int, index_board: str
) -> dict[str, Any]:
    first_reply = re.search(r'class="ReplyBox"', html, re.I)
    op_zone = html[: first_reply.start()] if first_reply else html
    op_id_m = re.search(r'id="post_(\d+)_image"', op_zone) or re.search(
        r'name="post_(\d+)"', op_zone
    )
    if not op_id_m:
        raise ValueError("could not parse thread OP")
    posts = [_parse_post_chunk(op_id_m.group(1), op_zone, True)]
    parts = re.split(r'<td[^>]*class="ReplyBox"[^>]*id="replybox_(\d+)"', html, flags=re.I)
    for i in range(1, len(parts), 2):
        pid = parts[i]
        chunk = parts[i + 1] if i + 1 < len(parts) else ""
        posts.append(_parse_post_chunk(pid, chunk[:12000], False))
    subject = next((p["subject"] for p in posts if p.get("subject")), None) or (
        posts[0].get("subject") if posts else ""
    ) or f"Thread {topic_id}"
    return {
        "id": topic_id,
        "liveBoard": live_board,
        "indexBoard": index_board,
        "subject": subject,
        "posts": posts,
    }


def post_multipart(payload: dict[str, Any]) -> dict[str, Any]:
    live = str(payload.get("liveBoard") or "").lower()
    assert_board_allowed(live)
    if live not in ALLOWED_LIVE:
        raise ValueError("posting only allowed on live boards")
    topic_id = int(payload.get("topicId") or 0)
    boundary = f"----me621u18{abs(hash(json.dumps(payload, sort_keys=True))) % 10**12}"
    chunks: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )

    add_field("topicid", str(topic_id))
    add_field("editid", "0")
    add_field("st", "")
    add_field("name", str(payload.get("name") or ""))
    add_field("email", str(payload.get("email") or ""))
    add_field("subject", str(payload.get("subject") or ""))
    add_field("comment", str(payload.get("comment") or ""))
    add_field("password", str(payload.get("password") or "password"))
    if payload.get("spoiler"):
        add_field("isSpoiler", "on")
    file_b64 = payload.get("fileBase64")
    file_name = payload.get("fileName")
    if file_b64 and file_name:
        import base64

        raw = str(file_b64)
        if "," in raw and raw.startswith("data:"):
            raw = raw.split(",", 1)[1]
        file_buf = base64.b64decode(raw)
        mime = str(payload.get("fileMime") or "application/octet-stream")
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file1"; filename="{file_name}"\r\n'
                f"Content-Type: {mime}\r\n\r\n"
            ).encode("utf-8")
        )
        chunks.append(file_buf)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)
    url = f"{U18CHAN_BASE}/board/u18chan/{live}/post/"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "User-Agent": UA,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
            "Referer": f"{U18CHAN_BASE}/{live}/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            loc = resp.headers.get("Location")
            return {"ok": True, "redirect": loc}
    except urllib.error.HTTPError as exc:
        if 300 <= exc.code < 400:
            return {"ok": True, "redirect": exc.headers.get("Location")}
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(_strip_tags(detail)[:200] or f"upstream post {exc.code}") from exc


def fetch_media(url: str) -> tuple[bytes, str]:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host.endswith("u18chan.com"):
        raise ValueError("host not allowed")
    path = parsed.path.lower()
    if "/cub/" in path or "/icub/" in path:
        raise ValueError("board not allowed")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Referer": U18CHAN_BASE + "/"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        ctype = resp.headers.get("Content-Type") or "application/octet-stream"
        return resp.read(), ctype
