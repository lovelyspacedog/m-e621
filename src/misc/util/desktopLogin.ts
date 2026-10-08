/** Tauri desktop sign-in. Hidden in the browser; the shell reads the site window. */

import { isTauriShell } from "@/misc/util/tauriLocalFs";

export type DesktopLoginSite =
  | "furaffinity"
  | "sofurry"
  | "tailspace"
  | "weasyl"
  | "itaku";

export type DesktopCookie = { name: string; value: string };

export type DesktopSiteSession = {
  cookies: DesktopCookie[];
  token: string | null;
};

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const getInvoke = (): TauriInvoke | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __TAURI__?: { invoke?: TauriInvoke } };
  if (typeof w.__TAURI__?.invoke === "function") {
    return w.__TAURI__.invoke.bind(w.__TAURI__);
  }
  return null;
};

export const desktopSignInAvailable = async (): Promise<boolean> => {
  if (isTauriShell()) return true;
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch("/api/desktop-login");
    if (!res.ok) return false;
    const body = (await res.json()) as { available?: boolean };
    return !!body.available;
  } catch {
    return false;
  }
};

const requireInvoke = (): TauriInvoke => {
  const invoke = getInvoke();
  if (!invoke) throw new Error("Desktop sign-in is only available in the PawDeck app");
  return invoke;
};

export const signInSite = async (site: DesktopLoginSite): Promise<DesktopSiteSession> => {
  if (isTauriShell()) return requireInvoke()<DesktopSiteSession>("sign_in_site", { site });
  const res = await fetch("/api/desktop-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site }),
  });
  const body = (await res.json()) as DesktopSiteSession & { message?: string };
  if (!res.ok) throw new Error(body.message || "Sign-in failed");
  return { cookies: body.cookies || [], token: body.token ?? null };
};

export const cookieByName = (cookies: DesktopCookie[], name: string): string =>
  cookies.find((cookie) => cookie.name.toLowerCase() === name.toLowerCase())?.value ??
  "";

export const cookieHeader = (cookies: DesktopCookie[]): string =>
  cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

/** Strip a pasted `Token ` prefix and surrounding quotes. */
export const normalizeDesktopToken = (raw: string | null | undefined): string => {
  const text = (raw || "").trim().replace(/^"|"$/g, "");
  return text.replace(/^Token\s+/i, "").trim();
};
