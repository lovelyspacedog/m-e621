import { downloadjs } from "@/Settings/download";
import { u18chanMediaUrl } from "@/worker/u18chan/api";

const filenameFromUpstream = (upstream: string, fallback: string): string => {
  try {
    const path = new URL(upstream).pathname;
    const base = path.split("/").pop() || fallback;
    const clean = base.replace(/[^\w.-]+/g, "_");
    return clean || fallback;
  } catch {
    return fallback;
  }
};

export async function downloadU18chanImage(
  upstreamUrl: string,
  fallbackName = "u18chan-image",
): Promise<void> {
  const proxied = u18chanMediaUrl(upstreamUrl);
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const name = filenameFromUpstream(upstreamUrl, fallbackName);
  downloadjs(await blob.arrayBuffer(), name, blob.type || "application/octet-stream");
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sequential browser downloads (one file per post). */
export async function downloadU18chanImages(
  upstreamUrls: string[],
  opts?: { gapMs?: number },
): Promise<{ ok: number; failed: number }> {
  const gapMs = opts?.gapMs ?? 350;
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < upstreamUrls.length; i++) {
    try {
      await downloadU18chanImage(upstreamUrls[i], `u18chan-${i + 1}`);
      ok += 1;
    } catch {
      failed += 1;
    }
    if (i < upstreamUrls.length - 1) await delay(gapMs);
  }
  return { ok, failed };
}
