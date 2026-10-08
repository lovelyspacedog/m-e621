import { spawn } from "node:child_process";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

/** Dev-server only. Production serve.py does not expose this. */

type SiteSpec = {
  title: string;
  startUrl: string;
  cookieUri: string;
  hosts: string[];
  cookieNames: string[];
  required: string[];
  readToken: boolean;
};

const SITES: Record<string, SiteSpec> = {
  furaffinity: {
    title: "Sign in — FurAffinity",
    startUrl: "https://www.furaffinity.net/login/",
    cookieUri: "https://www.furaffinity.net/",
    hosts: ["www.furaffinity.net", "furaffinity.net", "sfw.furaffinity.net"],
    cookieNames: ["a", "b"],
    required: ["a", "b"],
    readToken: false,
  },
  sofurry: {
    title: "Sign in — SoFurry",
    startUrl: "https://www.sofurry.com/user/login",
    cookieUri: "https://www.sofurry.com/",
    hosts: ["www.sofurry.com", "sofurry.com"],
    cookieNames: ["_session", "sofurry_session"],
    required: ["_session"],
    readToken: false,
  },
  tailspace: {
    title: "Sign in — Tailspace",
    startUrl: "https://tailspace.com/login",
    cookieUri: "https://tailspace.com/",
    hosts: ["tailspace.com", "www.tailspace.com"],
    cookieNames: ["tailspace_session"],
    required: ["tailspace_session"],
    readToken: false,
  },
  weasyl: {
    title: "Sign in — Weasyl",
    startUrl: "https://www.weasyl.com/signin",
    cookieUri: "https://www.weasyl.com/",
    hosts: ["www.weasyl.com", "weasyl.com"],
    cookieNames: ["sessionid", "csrftoken"],
    required: ["sessionid"],
    readToken: false,
  },
  itaku: {
    title: "Sign in — Itaku",
    startUrl: "https://itaku.ee/login",
    cookieUri: "https://itaku.ee/",
    hosts: ["itaku.ee", "www.itaku.ee"],
    cookieNames: ["token"],
    required: [],
    readToken: true,
  },
};

type HelperResult = {
  ok?: boolean;
  cookies?: { name: string; value: string }[];
  token?: string | null;
  message?: string;
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

const runWindow = (script: string, spec: SiteSpec) =>
  new Promise<HelperResult>((resolve, reject) => {
    const child = spawn("python3", [script, JSON.stringify(spec)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Sign-in window timed out"));
    }, 10 * 60 * 1000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const line = stdout
        .split("\n")
        .reverse()
        .find((row) => row.trim().startsWith("{"));
      if (!line) {
        reject(new Error(windowError(stderr)));
        return;
      }
      try {
        resolve(JSON.parse(line) as HelperResult);
      } catch {
        reject(new Error("Sign-in window returned invalid data"));
      }
    });
  });

const windowError = (stderr: string) => {
  const text = stderr.trim();
  if (/wayland|protocol error|cannot open display|broadway/i.test(text)) {
    return "Could not open the sign-in window on this display.";
  }
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.slice(-2).join(" ") || "Sign-in window closed without a session";
};

const missingRequired = (spec: SiteSpec, cookies: { name: string; value: string }[]) =>
  spec.required.filter(
    (name) =>
      !cookies.some(
        (cookie) => cookie.name.toLowerCase() === name.toLowerCase() && cookie.value,
      ),
  );

export function desktopLoginDevPlugin(rootDir: string): Plugin {
  const script = path.join(rootDir, "src-tauri", "site_login.py");
  return {
    name: "desktop-login-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/desktop-login") return next();
        if (process.platform !== "linux" || !fs.existsSync(script)) {
          sendJson(res, 404, { available: false });
          return;
        }
        if (req.method === "GET") {
          sendJson(res, 200, { available: true });
          return;
        }
        if (req.method !== "POST") return next();
        void (async () => {
          try {
            const raw = await readBody(req);
            const site = String((JSON.parse(raw || "{}") as { site?: string }).site || "");
            const spec = SITES[site];
            if (!spec) {
              sendJson(res, 400, { message: "Unknown site" });
              return;
            }
            const helper = await runWindow(script, spec);
            if (!helper.ok) {
              const message = (helper.message || "").trim();
              sendJson(res, 400, {
                message: !message || message === "Cancelled" ? "Sign-in cancelled." : message,
              });
              return;
            }
            const cookies = (helper.cookies || []).filter((cookie) =>
              spec.cookieNames.some((name) => name.toLowerCase() === cookie.name.toLowerCase()),
            );
            const missing = missingRequired(spec, cookies);
            if (missing.length) {
              sendJson(res, 400, {
                message: `Missing ${missing.join(", ")} after sign-in. Finish login in the site window, then try again.`,
              });
              return;
            }
            let token = helper.token?.trim() || null;
            if (spec.readToken) {
              if (!token) {
                sendJson(res, 400, {
                  message:
                    "No Itaku token in this window. Stay on itaku.ee after login, or paste the token.",
                });
                return;
              }
              if (token.length > 512) {
                sendJson(res, 400, { message: "Itaku token from the page was unexpectedly long." });
                return;
              }
            } else {
              token = null;
            }
            sendJson(res, 200, { cookies, token });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 500, { message });
          }
        })();
      });
    },
  };
}
