import { fileURLToPath, URL } from 'node:url'
import { defineConfig, Plugin, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'
import { execSync } from "child_process";
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';

const MEDIA_HOST_OK = (host: string) =>
  ['.e621.net', '.e926.net', '.e6ai.net'].some((s) => host.endsWith(s)) ||
  ['e621.net', 'e926.net', 'e6ai.net'].includes(host);

function e621MediaProxy(): Plugin {
  return {
    name: 'e621-media-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/download')) {
          next();
          return;
        }
        const raw = new URL(req.url, 'http://127.0.0.1').searchParams.get('url') || '';
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          res.statusCode = 400;
          res.end('bad url');
          return;
        }
        if (target.protocol !== 'https:' || !MEDIA_HOST_OK(target.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        fetch(target.toString(), {
          headers: { 'User-Agent': 'm-e621-download-proxy/1.0' },
        })
          .then(async (remote) => {
            res.statusCode = remote.status;
            res.setHeader(
              'Content-Type',
              remote.headers.get('content-type') || 'application/octet-stream',
            );
            res.end(Buffer.from(await remote.arrayBuffer()));
          })
          .catch((err) => {
            res.statusCode = 502;
            res.end(String(err));
          });
      });
    },
  };
}

function e621VotesProxy(): Plugin {
  return {
    name: 'e621-votes-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/votes') || req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let payload: { post_id?: number; score?: number };
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          res.statusCode = 400;
          res.end('invalid json');
          return;
        }
        const postId = payload.post_id;
        const score = payload.score;
        if (typeof postId !== 'number' || ![1, -1, 0].includes(score as number)) {
          res.statusCode = 400;
          res.end('post_id and score required');
          return;
        }
        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400;
          res.end('invalid X-Site-Base');
          return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401;
          res.end('missing basic auth');
          return;
        }
        try {
          const remote = await fetch(`${base.origin}/posts/${postId}/votes.json`, {
            method: 'POST',
            headers: {
              Authorization: String(auth),
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'm-e621-votes-proxy/1.0',
            },
            body: `score=${score}`,
          });
          res.statusCode = remote.status;
          res.setHeader(
            'Content-Type',
            remote.headers.get('content-type') || 'application/json',
          );
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

function e621FavoritesProxy(): Plugin {
  return {
    name: 'e621-favorites-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/favorites')) { next(); return; }
        if (req.method !== 'POST' && req.method !== 'DELETE') { next(); return; }

        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400; res.end('invalid X-Site-Base'); return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400; res.end('host not allowed'); return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401; res.end('missing basic auth'); return;
        }

        // Determine if this is DELETE /api/favorites/:id
        const deleteMatch = req.url.match(/^\/api\/favorites\/(\d+)/);

        try {
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            let payload: { post_id?: number } = {};
            try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
            catch { res.statusCode = 400; res.end('invalid json'); return; }
            if (typeof payload.post_id !== 'number') {
              res.statusCode = 400; res.end('post_id required'); return;
            }
            const remote = await fetch(`${base.origin}/favorites.json`, {
              method: 'POST',
              headers: {
                Authorization: String(auth),
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'm-e621-favorites-proxy/1.0',
              },
              body: new URLSearchParams({ post_id: String(payload.post_id) }).toString(),
            });
            res.statusCode = remote.status;
            res.setHeader('Content-Type', remote.headers.get('content-type') || 'application/json');
            res.end(Buffer.from(await remote.arrayBuffer()));
          } else if (req.method === 'DELETE' && deleteMatch) {
            const remote = await fetch(
              `${base.origin}/favorites/${deleteMatch[1]}.json`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: String(auth),
                  'User-Agent': 'm-e621-favorites-proxy/1.0',
                },
              },
            );
            res.statusCode = remote.status;
            res.setHeader('Content-Type', remote.headers.get('content-type') || 'application/json');
            res.end(Buffer.from(await remote.arrayBuffer()));
          } else {
            next();
          }
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

function e621CommentsProxy(): Plugin {
  return {
    name: 'e621-comments-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/comments') || req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        let payload: { post_id?: number; body?: string };
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch {
          res.statusCode = 400;
          res.end('invalid json');
          return;
        }
        const postId = payload.post_id;
        const body = payload.body;
        if (typeof postId !== 'number' || typeof body !== 'string' || !body.trim()) {
          res.statusCode = 400;
          res.end('post_id and body required');
          return;
        }
        const siteBase = String(req.headers['x-site-base'] || 'https://e621.net/');
        let base: URL;
        try {
          base = new URL(siteBase.endsWith('/') ? siteBase : `${siteBase}/`);
        } catch {
          res.statusCode = 400;
          res.end('invalid X-Site-Base');
          return;
        }
        if (!['e621.net', 'e926.net', 'e6ai.net'].includes(base.hostname.toLowerCase())) {
          res.statusCode = 400;
          res.end('host not allowed');
          return;
        }
        const auth = req.headers.authorization;
        if (!auth || !String(auth).toLowerCase().startsWith('basic ')) {
          res.statusCode = 401;
          res.end('missing basic auth');
          return;
        }
        try {
          const form = new URLSearchParams({
            'comment[post_id]': String(postId),
            'comment[body]': body,
          });
          const remote = await fetch(`${base.origin}/comments.json`, {
            method: 'POST',
            headers: {
              Authorization: String(auth),
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'm-e621-comments-proxy/1.0',
            },
            body: form.toString(),
          });
          res.statusCode = remote.status;
          res.setHeader(
            'Content-Type',
            remote.headers.get('content-type') || 'application/json',
          );
          res.end(Buffer.from(await remote.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

function generateSitemap(env: Record<string, string>): Plugin {
  return {
    name: 'generate-sitemap',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      const date = new Date().toISOString().split('T')[0];
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${env.VITE_APP_DOMAIN}/</loc>
    <lastmod>${date}</lastmod>
  </url>
</urlset>`;

      fs.writeFileSync(path.resolve(outDir, 'sitemap.xml'), sitemap);
    }
  };
}


const VITE_GIT_COMMIT_INFO = execSync(
  'git log -n 60 --pretty=format:";;;;;%H;%aI;%an;%B"',
)
  .toString()
  .trim();

const VITE_GIT_BRANCH = execSync("git branch --show-current")
  .toString()
  .trim();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      "import.meta.env.VITE_GIT_COMMIT_INFO": JSON.stringify(VITE_GIT_COMMIT_INFO),
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(VITE_GIT_BRANCH),
    },
    plugins: [
      e621MediaProxy(),
      e621VotesProxy(),
      e621CommentsProxy(),
      e621FavoritesProxy(),
      generateSitemap(env),
      vue(),
      vuetify(),
      vueDevTools(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          id: "/#/posts",
          name: "Material e621",
          short_name: "Material e6", // maximum of 12 characters recommended by chromium devs
          start_url: "/#/posts",
          scope: "/",
          display: "fullscreen",
          background_color: "#000000",
          theme_color: "#000000",
          description:
            "Material e621 is a modern, open source web client for e621.net. It is customizable, comes with a bunch of additional features that are not available on e621.net, and makes browsing posts a delightful experience.",
          orientation: "any",
          lang: "en",
          icons: [
            {
              "src": "pwa-64x64.png",
              "sizes": "64x64",
              "type": "image/png"
            },
            {
              "src": "pwa-192x192.png",
              "sizes": "192x192",
              "type": "image/png"
            },
            {
              "src": "pwa-512x512.png",
              "sizes": "512x512",
              "type": "image/png"
            },
            {
              "src": "maskable-icon-512x512.png",
              "sizes": "512x512",
              "type": "image/png",
              "purpose": "maskable"
            }
          ]
        }
      })

    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
    },
    build: {
      rollupOptions: {
        output: {
          format: 'iife',
        },
      },
    },
  }
})
