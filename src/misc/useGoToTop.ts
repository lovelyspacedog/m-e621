/**
 * Floating Go to top FAB (News feed/article).
 * Bottom-right so it clears the sidebar; respects visual viewport + tip toasts.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTipQueueStore } from "@/services";
import { prefersReducedMotion } from "./util/reducedMotion";

const SHOW_PX = 200;
const PAD = 12;

export function useGoToTop() {
  const tipQueue = useTipQueueStore();
  const visible = ref(false);
  const narrow = ref(false);
  const insets = ref({ bottom: 0, right: 0 });

  const documentScrollTop = () =>
    document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;

  const updateVisibility = () => {
    visible.value = documentScrollTop() > SHOW_PX;
  };

  const syncViewport = () => {
    const vv = window.visualViewport;
    if (!vv) {
      insets.value = { bottom: 0, right: 0 };
      narrow.value = window.innerWidth < 600;
      return;
    }
    insets.value = {
      bottom: Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
      right: Math.max(0, window.innerWidth - vv.offsetLeft - vv.width),
    };
    narrow.value = vv.width < 600;
  };

  const style = computed(() => {
    const tipClear = tipQueue.hasActive ? tipQueue.activeHeight : 0;
    return {
      bottom: `calc(${insets.value.bottom}px + max(${PAD}px, env(safe-area-inset-bottom, 0px)) + ${tipClear}px)`,
      right: `calc(${insets.value.right}px + max(${PAD}px, env(safe-area-inset-right, 0px)))`,
    };
  });

  const scrollToTop = () => {
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const el = document.scrollingElement;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: 0, behavior });
    } else {
      window.scrollTo({ top: 0, behavior });
    }
  };

  const onScroll = () => updateVisibility();

  onMounted(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    syncViewport();
    updateVisibility();
  });

  onUnmounted(() => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", syncViewport);
    window.removeEventListener("orientationchange", syncViewport);
    window.visualViewport?.removeEventListener("resize", syncViewport);
    window.visualViewport?.removeEventListener("scroll", syncViewport);
  });

  return { visible, narrow, style, scrollToTop };
}
