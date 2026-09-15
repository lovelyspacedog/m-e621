import { useSiteModeStore, useUrlStore } from "@/services";

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
  return `${base}posts/${id}`;
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

