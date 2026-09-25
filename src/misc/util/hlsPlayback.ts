/**
 * Attach hls.js for .m3u8 sources when the browser lacks native HLS.
 */
import Hls from "hls.js";

export type HlsHandle = {
  destroy: () => void;
};

export function urlLooksLikeHls(url?: string | null): boolean {
  if (!url) return false;
  return /\.m3u8(\?|#|$)/i.test(url) || url.includes("/api/murrtube/media");
}

export function attachHls(
  video: HTMLVideoElement,
  src: string,
): HlsHandle | null {
  if (!src) return null;
  const canNative =
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== "";
  if (canNative && !Hls.isSupported()) {
    video.src = src;
    return {
      destroy: () => {
        video.removeAttribute("src");
        video.load();
      },
    };
  }
  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return {
      destroy: () => {
        hls.destroy();
      },
    };
  }
  if (canNative) {
    video.src = src;
    return {
      destroy: () => {
        video.removeAttribute("src");
        video.load();
      },
    };
  }
  return null;
}
