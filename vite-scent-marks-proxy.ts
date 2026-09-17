/**
 * Vite-dev stub for Scent Marks.
 *
 * Full persistence / blocklist / admin hash live in serve.py only.
 * This middleware answers /api/scent-marks* with a clear 501 so
 * `npm run dev` does not look like a silent CORS/404 failure.
 */
import type { Plugin } from "vite";

const SCENT_PREFIX = "/api/scent-marks";

const MESSAGE =
  "Scent Marks API runs in serve.py (production / self-host). " +
  "Use `python serve.py` after `npm run build`, or the Expedition deploy — " +
  "not available under Vite alone.";

export function scentMarksProxy(): Plugin {
  return {
    name: "scent-marks-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0] || "";
        if (!path.startsWith(SCENT_PREFIX)) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS",
          );
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-Scent-Admin",
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
            marks: [],
            message: MESSAGE,
          }),
        );
      });
    },
  };
}
