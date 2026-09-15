import { useSiteModeStore, useUrlStore } from "@/services";
import { postPageUrl } from "@/misc/util/postOrigin";
import type { EnhancedPost } from "@/worker/ApiService";

export const getE6PostUrl = (id: number) => {
  const url = useUrlStore();
  const siteMode = useSiteModeStore();
  const base = url.e621Url.endsWith("/") ? url.e621Url : `${url.e621Url}/`;
  if (siteMode.isFurbooru) {
    return `${base}images/${id}`;
  }
  if (siteMode.isInkbunny) {
    return `${base}s/${id}`;
  }
  if (siteMode.isFurAffinity) {
    return `${base}view/${id}`;
  }
  if (siteMode.isWeasyl) {
    return `${base}submission/${id}`;
  }
  if (siteMode.isItaku) {
    return `${base}images/${id}`;
  }
  return `${base}posts/${id}`;
};

export const postStandaloneUrl = (post: EnhancedPost) => {
  const url = useUrlStore();
  const siteMode = useSiteModeStore();
  return postPageUrl(post, siteMode.activeMode, url.e621Url);
};

export const openUrlInNewTab = (url: string) => {
    if ("__TAURI__" in window) {
        (window as any).__TAURI__.shell.open(url);
        return;
    }
    const win = window.open(url, "_blank", "noopener");
    if (win) {
        win.opener = null;
        win.focus();
    }
}

export const openE6PostInStandaloneWindow = (id: number) =>
  openUrlInNewTab(getE6PostUrl(id));

