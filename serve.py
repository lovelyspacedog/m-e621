#!/usr/bin/env python3
"""Serve Material e621 dist/ + git pull API for self-hosted managed links."""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


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
MEDIA_HOST_SUFFIXES = (".e621.net", ".e926.net", ".e6ai.net")

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

    def do_OPTIONS(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Authorization, Content-Type, X-Pull-Token, X-Site-Base",
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
        return None

    def _proxy_media(self, raw_url: str) -> None:
        url = self._allowed_media_url(raw_url)
        if not url:
            self._json(400, {"ok": False, "message": "url not allowed"})
            return
        req = urllib.request.Request(url, method="GET")
        req.add_header(
            "User-Agent",
            f"m-e621-download-proxy/1.0 (https://{DOMAIN})",
        )
        req.add_header("Accept", "*/*")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            status = exc.code
            content_type = (
                exc.headers.get("Content-Type", "application/octet-stream")
                if exc.headers
                else "application/octet-stream"
            )
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
        path = urlparse(self.path).path
        match = FAVORITE_PATH.match(path)
        if match and match.group(1):
            self._proxy_favorite("DELETE", b"", match.group(1))
            return
        self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""

        if path == "/api/favorites":
            self._proxy_favorite("POST", body)
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
