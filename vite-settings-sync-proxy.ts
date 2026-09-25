/**
 * Vite-dev stub for host settings sync.
 * Persistence lives in serve.py (`~/.config/m-e621/settings_sync.json`).
 */
import type { Plugin } from "vite";

const PREFIX = "/api/settings-sync";

const MESSAGE =
  "Host settings sync runs in serve.py (production / self-host). " +
  "Use `python serve.py` after `npm run build`, or the Expedition deploy — " +
  "not available under Vite alone.";

export function settingsSyncProxy(): Plugin {
  return {
    name: "settings-sync-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0] || "";
        if (!path.startsWith(PREFIX)) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
          );
          res.end();
          return;
        }
        res.statusCode = 501;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(
          JSON.stringify({
            ok: false,
            message: MESSAGE,
          }),
        );
      });
    },
  };
}
