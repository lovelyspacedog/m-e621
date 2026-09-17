import { ref } from "vue";
import { DataSaverType } from "@/services/types";

// Network Information API — limited support
// https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
// Chromium usually exposes effectiveType + saveData; connection.type is rare.

export type DataSaverQuality = "low" | "medium" | "high";

export type ConnectionType =
  | "bluetooth"
  | "cellular"
  | "ethernet"
  | "none"
  | "wifi"
  | "wimax"
  | "other"
  | "unknown";

export type EffectiveConnectionType = "slow-2g" | "2g" | "3g" | "4g";

export interface INetworkInfo {
  type: ConnectionType;
  saveData: boolean;
  effectiveType: EffectiveConnectionType | "";
  effectiveTypeSupported: boolean;
  typeSupported: boolean;
}

type NetworkInformationLike = {
  type?: string;
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

const nav = navigator as Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

const connection = (): NetworkInformationLike | undefined =>
  nav.connection || nav.mozConnection || nav.webkitConnection;

const isConnectionType = (value: unknown): value is ConnectionType =>
  typeof value === "string" &&
  [
    "bluetooth",
    "cellular",
    "ethernet",
    "none",
    "wifi",
    "wimax",
    "other",
    "unknown",
  ].includes(value);

const isEffectiveType = (value: unknown): value is EffectiveConnectionType =>
  typeof value === "string" &&
  ["slow-2g", "2g", "3g", "4g"].includes(value);

export const getNetworkInfo = (
  conn: NetworkInformationLike | undefined = connection(),
): INetworkInfo => {
  const type = conn?.type;
  const effectiveType = conn?.effectiveType;
  return {
    saveData: !!conn?.saveData,
    typeSupported: isConnectionType(type),
    type: isConnectionType(type) ? type : "unknown",
    effectiveType: isEffectiveType(effectiveType) ? effectiveType : "",
    effectiveTypeSupported: isEffectiveType(effectiveType),
  };
};

/**
 * Pick preview quality for Automatic data saver.
 * Prefer connection.type when present; otherwise effectiveType (Chromium);
 * if neither is available, medium (or low when Save-Data is on).
 */
export function resolveAutoQuality(info: INetworkInfo): DataSaverQuality {
  if (info.typeSupported) {
    if (info.type === "bluetooth" || info.type === "cellular") {
      return "low";
    }
    if (info.type === "ethernet" || info.type === "wifi") {
      return info.saveData ? "medium" : "high";
    }
  }

  if (info.effectiveTypeSupported) {
    if (info.effectiveType === "slow-2g" || info.effectiveType === "2g") {
      return "low";
    }
    if (info.effectiveType === "3g") {
      return info.saveData ? "low" : "medium";
    }
    // 4g
    return info.saveData ? "medium" : "high";
  }

  return info.saveData ? "low" : "medium";
}

export function resolveDataSaverQuality(
  mode: DataSaverType,
  info: INetworkInfo,
): DataSaverQuality {
  switch (mode) {
    case DataSaverType.lowest:
      return "low";
    case DataSaverType.medium:
      return "medium";
    case DataSaverType.highest:
      return "high";
    case DataSaverType.auto:
    default:
      return resolveAutoQuality(info);
  }
}

const info = ref<INetworkInfo>(getNetworkInfo());

export const useDataSaverInfo = () => {
  return {
    dataSaverInfo: info,
  };
};

let timeoutId: ReturnType<typeof setTimeout> | null = null;
const refreshIntervalMs = 2 * 60 * 1000;

const handleChange = () => {
  info.value = getNetworkInfo();
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  // Some browsers fire change sparsely; poll as a light fallback.
  timeoutId = setTimeout(handleChange, refreshIntervalMs);
};

const conn = connection();
conn?.addEventListener?.("change", handleChange);

handleChange();
