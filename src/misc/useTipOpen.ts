import { ref } from "vue";
import { useAppearanceStore } from "@/services";
import type { TipId } from "./tipIds";

/** Open-state helper for one TipDialog: false→true edge + dismissal guard. */
export function useTipOpen(tipId: TipId) {
  const appearance = useAppearanceStore();
  const open = ref(false);

  const tryOpen = () => {
    if (!appearance.isTipDismissed(tipId)) {
      open.value = true;
    }
  };

  /** Call from a watch: opens only on false → true (or first true when was is undefined). */
  const tryOpenOnEdge = (now: boolean, was: boolean | undefined) => {
    if (now && !was) tryOpen();
  };

  return { open, tryOpen, tryOpenOnEdge };
}
