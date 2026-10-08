#!/usr/bin/env python3
"""Linux sign-in window (WebKitGTK 4.1). Prints one JSON object on stdout."""

from __future__ import annotations

import json
import sys
from urllib.parse import urlparse

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2  # noqa: E402


def navigation_allowed(hosts: list[str], uri: str) -> bool:
    parsed = urlparse(uri)
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    return any(host == allowed.lower() for allowed in hosts)


def pick_cookies(allowed: list[str], found: list[tuple[str, str]]) -> list[dict[str, str]]:
    picked: list[dict[str, str]] = []
    for name in allowed:
        for found_name, value in found:
            if found_name.lower() == name.lower() and value:
                picked.append({"name": found_name, "value": value})
                break
    return picked


ITAKU_TOKEN_SCRIPT = r"""(function(){
  function unwrap(raw) {
    if (!raw) return "";
    var text = String(raw).trim();
    if (!text || text.length > 512) return "";
    try {
      var parsed = JSON.parse(text);
      if (typeof parsed === "string") return parsed.trim();
      if (parsed && typeof parsed.token === "string") return parsed.token.trim();
      if (parsed && typeof parsed.key === "string") return parsed.key.trim();
    } catch (e) {}
    return text.replace(/^Token\s+/i, "").trim();
  }
  function scan(store) {
    if (!store) return "";
    var keys = ["token", "authToken", "auth_token", "accessToken", "access_token"];
    var i;
    for (i = 0; i < keys.length; i++) {
      try {
        var hit = unwrap(store.getItem(keys[i]));
        if (hit) return hit;
      } catch (e) {}
    }
    try {
      for (i = 0; i < store.length; i++) {
        var key = store.key(i) || "";
        if (!/token/i.test(key)) continue;
        var val = unwrap(store.getItem(key));
        if (val) return val;
      }
    } catch (e) {}
    return "";
  }
  return scan(window.localStorage) || scan(window.sessionStorage) || "";
})()"""


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: site_login.py <spec.json>", file=sys.stderr)
        return 2
    spec = json.loads(sys.argv[1])
    start_url = str(spec["startUrl"])
    cookie_uri = str(spec["cookieUri"])
    hosts = [str(host) for host in spec["hosts"]]
    cookie_names = [str(name) for name in spec["cookieNames"]]
    read_token = bool(spec.get("readToken"))
    title = str(spec.get("title") or "Sign in")

    result: dict[str, object] = {
        "ok": False,
        "cookies": [],
        "token": None,
        "message": "Cancelled",
    }

    window = Gtk.Window(title=title)
    window.set_default_size(960, 800)
    header = Gtk.HeaderBar()
    header.set_show_close_button(True)
    header.set_title(title)
    window.set_titlebar(header)

    use_button = Gtk.Button(label="Use this session")
    cancel_button = Gtk.Button(label="Cancel")
    header.pack_end(use_button)
    header.pack_end(cancel_button)

    webview = WebKit2.WebView()
    scroll = Gtk.ScrolledWindow()
    scroll.add(webview)
    window.add(scroll)

    finished = {"done": False}

    def finish(ok: bool, cookies: list[dict[str, str]], token: str | None, message: str) -> None:
        if finished["done"]:
            return
        finished["done"] = True
        result["ok"] = ok
        result["cookies"] = cookies
        result["token"] = token
        result["message"] = message
        Gtk.main_quit()

    def on_cancel(_button: Gtk.Button) -> None:
        finish(False, [], None, "Cancelled")

    def on_destroy(_window: Gtk.Window) -> None:
        finish(False, [], None, "Cancelled")

    def emit_cookies(found: list[tuple[str, str]], token: str | None) -> None:
        finish(True, pick_cookies(cookie_names, found), token, "")

    def read_token_then(found: list[tuple[str, str]]) -> None:
        if not read_token:
            emit_cookies(found, None)
            return
        for name, value in found:
            if name.lower() == "token" and value:
                emit_cookies(found, value)
                return

        def on_js(view: WebKit2.WebView, res: object) -> None:
            token = ""
            try:
                value = view.evaluate_javascript_finish(res)
                token = (value.to_string() if value is not None else "") or ""
            except Exception as exc:  # noqa: BLE001
                finish(False, [], None, str(exc))
                return
            token = token.strip().strip('"')
            if token in ("undefined", "null"):
                token = ""
            emit_cookies(found, token or None)

        webview.evaluate_javascript(ITAKU_TOKEN_SCRIPT, -1, None, None, None, on_js)

    def on_use(_button: Gtk.Button) -> None:
        def on_cookies(manager: WebKit2.CookieManager, res: object) -> None:
            try:
                cookies = manager.get_cookies_finish(res) or []
            except Exception as exc:  # noqa: BLE001
                finish(False, [], None, str(exc))
                return
            found: list[tuple[str, str]] = []
            for cookie in cookies:
                name = cookie.get_name() or ""
                value = cookie.get_value() or ""
                if name and value:
                    found.append((name, value))
            read_token_then(found)

        webview.get_context().get_cookie_manager().get_cookies(cookie_uri, None, on_cookies)

    def on_decide(
        _view: WebKit2.WebView,
        decision: WebKit2.PolicyDecision,
        decision_type: WebKit2.PolicyDecisionType,
    ) -> bool:
        if decision_type != WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
            return False
        action = decision.get_navigation_action()
        uri = ""
        if action is not None:
            request = action.get_request()
            if request is not None:
                uri = request.get_uri() or ""
        if navigation_allowed(hosts, uri):
            return False
        decision.ignore()
        return True

    cancel_button.connect("clicked", on_cancel)
    use_button.connect("clicked", on_use)
    window.connect("destroy", on_destroy)
    webview.connect("decide-policy", on_decide)
    webview.load_uri(start_url)
    window.show_all()
    Gtk.main()
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        json.dump(
            {"ok": False, "cookies": [], "token": None, "message": str(exc)},
            sys.stdout,
        )
        sys.stdout.write("\n")
        raise SystemExit(1)
