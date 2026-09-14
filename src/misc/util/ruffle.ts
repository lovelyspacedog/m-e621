/**
 * Lazy-loads the self-hosted Ruffle Flash emulator.
 * During dev the Vite `rufflePlugin` serves /ruffle/* from node_modules.
 * At build time those files are copied to dist/ruffle/.
 */

export type RufflePlayerElement = HTMLElement & {
  load: (config: { url: string; allowScriptAccess: string }) => Promise<void>;
  pause: () => void;
  play: () => void;
};

type RuffleAPI = {
  createPlayer: () => RufflePlayerElement;
};

declare global {
  interface Window {
    RufflePlayer?: {
      newest?: () => RuffleAPI;
      config?: Record<string, unknown>;
    };
  }
}

let rufflePromise: Promise<RuffleAPI> | null = null;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ruffle-src="${CSS.escape(src)}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.ruffleSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Ruffle: ${src}`));
    document.head.appendChild(script);
  });

const ruffleBaseUrl = (): string => {
  const base = import.meta.env.BASE_URL ?? '/';
  return base.endsWith('/') ? `${base}ruffle/` : `${base}/ruffle/`;
};

export const ensureRuffle = async (): Promise<RuffleAPI> => {
  if (!rufflePromise) {
    rufflePromise = (async () => {
      const publicPath = ruffleBaseUrl();

      // Tell Ruffle where to find its companion WASM/worker files before loading
      if (!window.RufflePlayer) {
        (window as Window & { RufflePlayer: Record<string, unknown> }).RufflePlayer = {};
      }
      (window.RufflePlayer as Record<string, unknown>).config = { publicPath };

      await loadScript(`${publicPath}ruffle.js`);

      // Ruffle registers itself asynchronously — poll until ready
      let retries = 0;
      while (!window.RufflePlayer?.newest && retries < 100) {
        await new Promise<void>((r) => setTimeout(r, 50));
        retries++;
      }
      const api = window.RufflePlayer?.newest?.();
      if (!api) throw new Error('Ruffle failed to initialise after loading');
      return api;
    })().catch((err) => {
      rufflePromise = null;
      throw err;
    });
  }
  return rufflePromise;
};
