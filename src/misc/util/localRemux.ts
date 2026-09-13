/** Remux local videos to browser-playable MP4 via ffmpeg.wasm (CDN, avoids IIFE bundle). */

const FFMPEG_VERSION = "0.12.15";
const UTIL_VERSION = "0.12.2";
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

const getGlobals = () => {
  const w = window as Window & {
    FFmpegWASM?: { FFmpeg: FFmpegCtor };
    FFmpegUtil?: {
      toBlobURL: (url: string, mime: string) => Promise<string>;
      fetchFile: (data: Blob | Uint8Array | string) => Promise<Uint8Array>;
    };
  };
  if (!w.FFmpegWASM?.FFmpeg || !w.FFmpegUtil?.toBlobURL) {
    throw new Error("ffmpeg.wasm failed to initialize");
  }
  return { FFmpeg: w.FFmpegWASM.FFmpeg, util: w.FFmpegUtil };
};

const ensureFFmpeg = async (
  onProgress?: (ratio: number) => void,
): Promise<FFmpegInstance> => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      await loadScript(
        `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/ffmpeg.js`,
      );
      await loadScript(
        `https://cdn.jsdelivr.net/npm/@ffmpeg/util@${UTIL_VERSION}/dist/umd/index.js`,
      );
      const { FFmpeg, util } = getGlobals();
      const base = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`;
      const ffmpeg = new FFmpeg();
      if (onProgress) {
        ffmpeg.on("progress", ({ progress }) => onProgress(progress));
      }
      await ffmpeg.load({
        coreURL: await util.toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await util.toBlobURL(
          `${base}/ffmpeg-core.wasm`,
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
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => onProgress(progress));
  }
  return ffmpeg;
};

export const remuxBlobToMp4 = async (
  input: Blob,
  inputName: string,
  onProgress?: (ratio: number) => void,
): Promise<Blob> => {
  const ffmpeg = await ensureFFmpeg(onProgress);
  const { util } = getGlobals();
  const safeIn = inputName.replace(/[^\w.-]+/g, "_") || "input.bin";
  const outName = "output.mp4";
  await ffmpeg.writeFile(safeIn, await util.fetchFile(input));
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
