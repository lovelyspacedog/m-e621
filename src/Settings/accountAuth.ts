import { formatDistanceToNow } from "date-fns";

/** Per-site verify / login probe (session UI; not persisted). */
export type AuthProbe = {
  success: boolean;
  loading: boolean;
  message: string;
  /** Epoch ms of last completed verify/login attempt; null if never probed. */
  checkedAt: number | null;
};

export const emptyAuth = (): AuthProbe => ({
  success: false,
  loading: false,
  message: "",
  checkedAt: null,
});

export const markAuthProbe = (
  probe: AuthProbe,
  ok: boolean,
  message: string,
) => {
  probe.success = ok;
  probe.message = message;
  probe.checkedAt = Date.now();
};

export const clearAuthProbe = (probe: AuthProbe) => {
  probe.success = false;
  probe.message = "";
  probe.checkedAt = null;
};

/** Append “Last verified …” / “Last check failed …” when a probe exists. */
export const formatAuthProbeHint = (
  probe: AuthProbe,
  connected: boolean,
): string | null => {
  if (!connected || !probe.checkedAt) return null;
  const when = formatDistanceToNow(probe.checkedAt, { addSuffix: true });
  return probe.success ? `Last verified ${when}` : `Last check failed ${when}`;
};

export type AuthChipState = {
  label: string;
  color: string | undefined;
  variant: "tonal" | "outlined";
};

export const authChipState = (
  connected: boolean,
  probe: AuthProbe | null | undefined,
): AuthChipState => {
  if (!connected) {
    return { label: "No credentials", color: undefined, variant: "outlined" };
  }
  if (probe?.checkedAt != null && probe.success) {
    return { label: "Verified", color: "success", variant: "tonal" };
  }
  if (probe?.checkedAt != null && !probe.success) {
    return { label: "Check failed", color: "error", variant: "tonal" };
  }
  return { label: "Auth saved", color: "success", variant: "tonal" };
};
