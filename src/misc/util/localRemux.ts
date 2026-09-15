/** Remux local videos to browser-playable MP4 via ffmpeg.wasm.
 * FFmpeg UMD + worker are served same-origin from /ffmpeg/ (Workers can't load cross-origin CDN scripts).
 * Core wasm still comes from jsDelivr via blob URLs.
 */

const CORE_VERSION = "0.12.6";

type FFmpegInstance = {
  loaded: boolean;
  load: (config: Record<string, string>) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  deleteFile: (name: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
  on: (event: string, cb: (payload: { progress: number }) => void) => void;
};

type FFmpegCtor = new () => FFmpegInstance;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;
let progressCb: ((ratio: number) => void) | null = null;
let progressHooked = false;

const ffmpegBaseUrl = () => {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}ffmpeg/`;
};

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-ffmpeg-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.ffmpegSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

/** Avoid @ffmpeg/util UMD — its browser build still calls require(). */
const toBlobURL = async (url: string, mimeType: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const data = await response.arrayBuffer();
  return URL.createObjectURL(new Blob([data], { type: mimeType }));
};

const fetchFile = async (data: Blob | Uint8Array | string) => {
  if (typeof data === "string") {
    const response = await fetch(data);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(await data.arrayBuffer());
};

const getFFmpegCtor = (): FFmpegCtor => {
  const w = window as Window & {
    FFmpegWASM?: { FFmpeg: FFmpegCtor };
  };
  if (!w.FFmpegWASM?.FFmpeg) {
    throw new Error(
      "ffmpeg.wasm script loaded but FFmpegWASM global is missing",
    );
  }
  return w.FFmpegWASM.FFmpeg;
};

const ensureFFmpeg = async (
  onProgress?: (ratio: number) => void,
): Promise<FFmpegInstance> => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      // Same-origin UMD so the package can spawn ./814.ffmpeg.js as a Worker.
      await loadScript(`${ffmpegBaseUrl()}ffmpeg.js`);
      const FFmpeg = getFFmpegCtor();
      const coreBase = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
      const ffmpeg = new FFmpeg();
      if (!progressHooked) {
        progressHooked = true;
        ffmpeg.on("progress", ({ progress }) => {
          progressCb?.(progress);
        });
      }
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${coreBase}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${coreBase}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
      return ffmpeg;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  const ffmpeg = await ffmpegPromise;
  progressCb = onProgress || null;
  return ffmpeg;
};

export const remuxBlobToMp4 = async (
  input: Blob,
  inputName: string,
  onProgress?: (ratio: number) => void,
): Promise<Blob> => {
  const ffmpeg = await ensureFFmpeg(onProgress);
  const safeIn = inputName.replace(/[^\w.-]+/g, "_") || "input.bin";
  const outName = "output.mp4";
  await ffmpeg.writeFile(safeIn, await fetchFile(input));
  try {
    const code = await ffmpeg.exec([
      "-i",
      safeIn,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outName,
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code}`);
    }
    const data = await ffmpeg.readFile(outName);
    if (typeof data === "string") {
      throw new Error("Unexpected ffmpeg text output");
    }
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    try {
      await ffmpeg.deleteFile(safeIn);
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outName);
    } catch {
      // ignore
    }
  }
};
