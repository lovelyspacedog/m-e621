/** Browser-playable audio extensions used across Local + remote site modes. */
export const AUDIO_EXTS = new Set(["flac", "mp3", "m4a", "ogg", "opus", "wav"]);

export function isAudioExt(ext?: string | null): boolean {
  return !!ext && AUDIO_EXTS.has(ext.toLowerCase());
}

/** MIME fallback when a download response omits Content-Type. */
export function audioMimeFromExt(ext?: string | null): string | null {
  switch ((ext || "").toLowerCase()) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "flac":
      return "audio/flac";
    case "wav":
      return "audio/wav";
    default:
      return null;
  }
}
