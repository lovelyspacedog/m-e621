<template>
  <!-- grid -->
  <!-- <v-row v-if="layout === 'grid'" row wrap="">
    <v-col
      v-for="post in visiblePosts"
      :key="post.id"
      v-bind="gridSizes"
      ref="posts"
    >
      <slot name="post" :post="post" />
    </v-col>
  </v-row> -->
  <!-- blog/feed -->
  <!-- v-else -->
  <v-col
    cols="12"
    :lg="fullWidthFeed ? 12 : 6"
    :md="fullWidthFeed ? 12 : 8"
    :offset-lg="fullWidthFeed ? 0 : 3"
    :offset-md="fullWidthFeed ? 0 : 2"
    wrap=""
  >
    <v-col :key="post.id" cols="12" class="mb-5" v-for="(post, idx) in visiblePosts" :ref="(ref) => addElement(idx, ref as any)">
<!-- ((ref: Element | ComponentPublicInstance | null, refs: Record<string, any>) => void -->
      <!-- <intersect @enter="triggerLoad(idx, 'enter', $event)" @leave="triggerLoad(idx, 'leave', $event)" :threshold="[0]" -->
        <!-- :root="null" root-margin="0px 0px 0px 0px" v-if="shouldHaveIntersectionObserver(idx)"> -->
        <!-- @change="say('change', $event)" -->
        <slot name="post" :post="post" />
      <!-- </intersect> -->
      <!-- <slot v-else name="post" :post="post" /> -->
    </v-col>
  </v-col>
</template>

<script lang="ts">
import { usePostsStore } from "@/services";
import type { EnhancedPost } from "@/worker/ApiService";
import { saveLocalResume } from "@/misc/util/localMedia";
import type { ComponentPublicInstance, PropType} from "vue";
import { computed, defineComponent, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, provide, ref, watch } from "vue";
// import Intersect from "vue-intersect";

const isAnyPartOfElementInViewport = (el: Element) => {
  const rect = el.getBoundingClientRect();
  const windowHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;

  const vertInView = rect.top <= windowHeight && rect.top + rect.height >= 0;
  const horInView = rect.left <= windowWidth && rect.left + rect.width >= 0;

  return vertInView && horInView;
};

const getOffset = (el: Element) => {
  let curEl:
    | {
      offsetTop?: number;
      scrollTop: number;
      offsetParent?: Element | null;
    }
    | null
    | undefined = el;
  let top = 0;
  do {
    top += (curEl.offsetTop || 0) - curEl.scrollTop;
  } while ((curEl = curEl?.offsetParent));
  return top;
};

export default defineComponent({
  components: {
    // Intersect,
  },
  props: {
    visiblePosts: {
      type: Array as PropType<EnhancedPost[]>,
      required: true,
    },
    loading: {
      type: Boolean,
      required: true,
    },
    autoNextPaused: {
      type: Boolean,
      default: false,
    },
    resumeEnabled: {
      type: Boolean,
      default: false,
    },
    restorePath: {
      type: String,
      default: undefined,
    },
    restoreVideoTime: {
      type: Number,
      default: undefined,
    },
  },
  setup(props, context) {
    const layout = ref<"list" | "grid">("list");
    const size = ref<"sm" | "md" | "lg">("md");
    const firstVisibleElement = ref<ComponentPublicInstance | null>(null);
    const posts = ref<ComponentPublicInstance[]>([]);
    const hasLeftElementThatTriggersPreviousPage = ref(false);
    const canTriggerLoad = ref({ previous: false, next: false });
    const postsStore = usePostsStore();
    const fullWidthFeed = computed(() => postsStore.fullWidthFeed);

    watch(props.visiblePosts,
      () => {
        canTriggerLoad.value = { next: true, previous: true };
      },
    );

    const handleScroll = (event: Event) => {
      if (!props.visiblePosts.length || !posts.value.length) return;
      firstVisibleElement.value =
        posts.value.find((post) =>
          isAnyPartOfElementInViewport(post.$el),
        ) || null;
      if (postsStore.cardAutoNext && !props.autoNextPaused) {
        const index = currentCardIndex();
        if (index !== lastDwellIndex) {
          lastDwellIndex = index;
          scheduleAutoNext();
        }
      }
      if (props.resumeEnabled) {
        scheduleResumeSave();
      }
    };

    //   // return "gridmd"; // blog, feed(sm|md|xl), grid(sm|md|xl)
    onMounted(() => {
      window.addEventListener("scroll", handleScroll);
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("keydown", onKeyDown);
      document.addEventListener("pointerover", onPointerOver);
      document.addEventListener("pointerout", onPointerOut);
      scheduleAutoNext();
      void tryRestore();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      persistResumeNow();
      detachVideoTimeListener();
      if (resumeSaveTimer) window.clearTimeout(resumeSaveTimer);
      clearAutoNextSchedule();
    });

    // gridSizes() {
    //   return {
    //     xs6: this.size == "sm" || this.size == "md",
    //     sm4: this.size == "sm",
    //     md3: this.size == "sm",
    //     lg2: this.size == "sm",
    //     xl1: this.size == "sm",

    //     sm6: this.size == "md",
    //     md4: this.size == "md",
    //     lg3: this.size == "md",
    //     xl2: this.size == "md",

    //     cols="12": this.size == "xl",
    //     sm12: this.size == "xl",
    //     md="6": this.size == "xl",
    //     lg4: this.size == "xl",
    //     xl3: this.size == "xl",
    //   };
    // },

    const visiblePostIds = computed(() => props.visiblePosts.map((p) => p.id));
    watch(
      () => visiblePostIds.value,
      async () => {
        hasLeftElementThatTriggersPreviousPage.value = false;
        if (firstVisibleElement.value) {
          // get the offset between the first visible post and the top of the viewport (before the dom update)
          const el = firstVisibleElement.value;
          const oldScrollOffset = getOffset(el.$el) - window.scrollY;
          await nextTick();
          // the dom has now been updated - scroll the view so the offset to the first post is the same as before the dom update
          const newScroll = getOffset(el.$el) - oldScrollOffset;
          window.scrollTo({ top: newScroll });
        }
      },
    );

    onBeforeUpdate(() => {
      // Make sure to reset the refs before each update.
      posts.value = [];
    });

    const addElement = (idx: number, el: ComponentPublicInstance) => {
      if (el) {
        posts.value[idx] = el;
      }
    }

    let clearAutoNext: (() => void) | null = null;
    let waitingForMorePosts = false;
    let lastDwellIndex = -1;
    let dwellStartedAt = 0;
    let dwellRemainingMs = 0;
    let progressRaf = 0;
    let resumeSaveTimer = 0;
    let videoTimeListener: {
      video: HTMLVideoElement;
      onTimeUpdate: () => void;
    } | null = null;
    let restoreAttempted = false;
    const userPaused = ref(false);
    const hoverPaused = ref(false);
    const autoNextProgress = ref(0);
    const autoNextActiveId = ref<number | null>(null);

    provide("cardAutoNext", {
      activeId: autoNextActiveId,
      progress: autoNextProgress,
      paused: computed(() => userPaused.value || hoverPaused.value),
    });

    const clearAutoNextSchedule = () => {
      clearAutoNext?.();
      clearAutoNext = null;
      if (progressRaf) {
        cancelAnimationFrame(progressRaf);
        progressRaf = 0;
      }
      autoNextProgress.value = 0;
    };

    const cardEl = (index: number): HTMLElement | null => {
      const el = posts.value[index]?.$el;
      return el instanceof HTMLElement ? el : null;
    };

    const cardTarget = (index: number): HTMLElement | null => {
      const wrap = cardEl(index);
      if (!wrap) return null;
      return wrap.querySelector<HTMLElement>("[id^='post_']") || wrap;
    };

    const headerOffset = () => {
      const bar = document.querySelector(".v-app-bar");
      if (!(bar instanceof HTMLElement)) return 0;
      const style = getComputedStyle(bar);
      if (style.display === "none" || style.visibility === "hidden") return 0;
      if (style.position !== "fixed" && style.position !== "sticky") return 0;
      return Math.max(0, bar.getBoundingClientRect().bottom);
    };

    const currentCardIndex = () => {
      const viewHeight =
        window.innerHeight || document.documentElement.clientHeight;
      const topBound = headerOffset();
      let bestIndex = 0;
      let bestVisible = -1;
      posts.value.forEach((post, index) => {
        const el = cardTarget(index) || (post?.$el instanceof Element ? post.$el : null);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const visible =
          Math.min(rect.bottom, viewHeight) - Math.max(rect.top, topBound);
        if (visible > bestVisible) {
          bestVisible = visible;
          bestIndex = index;
        }
      });
      return bestIndex;
    };

    const goToIndex = (index: number) => {
      const target = cardTarget(index);
      if (!target) return;
      const gap = 8;
      const top =
        window.scrollY + target.getBoundingClientRect().top - headerOffset() - gap;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };

    const canRunAutoNext = () =>
      postsStore.cardAutoNext &&
      !props.autoNextPaused &&
      !userPaused.value &&
      !hoverPaused.value &&
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      props.visiblePosts.length > 0;

    const setActiveCard = (index: number) => {
      autoNextActiveId.value = props.visiblePosts[index]?.id ?? null;
    };

    const startProgress = (durationMs: number, startedAt = performance.now()) => {
      if (progressRaf) cancelAnimationFrame(progressRaf);
      dwellStartedAt = startedAt;
      dwellRemainingMs = durationMs;
      const tick = () => {
        if (userPaused.value || hoverPaused.value) {
          progressRaf = 0;
          return;
        }
        const elapsed = performance.now() - dwellStartedAt;
        const ratio = Math.min(1, elapsed / Math.max(1, durationMs));
        autoNextProgress.value = ratio * 100;
        if (ratio < 1) {
          progressRaf = requestAnimationFrame(tick);
        } else {
          progressRaf = 0;
        }
      };
      progressRaf = requestAnimationFrame(tick);
    };

    const detachVideoTimeListener = () => {
      if (!videoTimeListener) return;
      videoTimeListener.video.removeEventListener(
        "timeupdate",
        videoTimeListener.onTimeUpdate,
      );
      videoTimeListener = null;
    };

    const currentResumeSnapshot = () => {
      const index = currentCardIndex();
      const post = props.visiblePosts[index];
      const path = post?.__meta?.localPath;
      if (!path) return null;
      const video = cardEl(index)?.querySelector("video");
      const videoTime =
        video && Number.isFinite(video.currentTime) && video.currentTime > 0.5
          ? video.currentTime
          : undefined;
      return { path, videoTime, index, video };
    };

    const persistResumeNow = () => {
      if (!props.resumeEnabled) return;
      const snap = currentResumeSnapshot();
      if (!snap) return;
      void saveLocalResume(snap.path, snap.videoTime);
    };

    const scheduleResumeSave = () => {
      if (!props.resumeEnabled) return;
      if (resumeSaveTimer) window.clearTimeout(resumeSaveTimer);
      resumeSaveTimer = window.setTimeout(() => {
        resumeSaveTimer = 0;
        persistResumeNow();
        attachVideoTimeListener();
      }, 400);
    };

    const attachVideoTimeListener = () => {
      if (!props.resumeEnabled) return;
      const snap = currentResumeSnapshot();
      detachVideoTimeListener();
      if (!snap?.video) return;
      const video = snap.video;
      const path = snap.path;
      let lastSaved = 0;
      const onTimeUpdate = () => {
        const now = performance.now();
        if (now - lastSaved < 1000) return;
        lastSaved = now;
        void saveLocalResume(path, video.currentTime);
      };
      video.addEventListener("timeupdate", onTimeUpdate);
      videoTimeListener = { video, onTimeUpdate };
    };

    const seekRestoredVideo = (index: number, time: number) => {
      const video = cardEl(index)?.querySelector("video");
      if (!video || !Number.isFinite(time) || time <= 0) return;
      const apply = () => {
        try {
          video.currentTime = time;
        } catch {
          // ignore
        }
      };
      if (video.readyState >= 1) {
        apply();
      } else {
        video.addEventListener("loadedmetadata", apply, { once: true });
      }
    };

    const tryRestore = async () => {
      if (restoreAttempted || !props.restorePath || props.loading) return;
      const index = props.visiblePosts.findIndex(
        (post) => post.__meta?.localPath === props.restorePath,
      );
      if (index < 0) return;
      restoreAttempted = true;
      await nextTick();
      goToIndex(index);
      if (typeof props.restoreVideoTime === "number") {
        seekRestoredVideo(index, props.restoreVideoTime);
      }
      context.emit("restored");
      attachVideoTimeListener();
    };

    const advanceCard = () => {
      if (!canRunAutoNext()) return;
      const index = currentCardIndex();
      const next = index + 1;
      if (next >= props.visiblePosts.length) {
        waitingForMorePosts = true;
        context.emit("load-next-page");
        return;
      }
      waitingForMorePosts = false;
      lastDwellIndex = next;
      goToIndex(next);
      scheduleAutoNextAt(next);
    };

    const scheduleAutoNext = () => {
      scheduleAutoNextAt(currentCardIndex());
    };

    const scheduleImageDwell = (index: number, durationMs: number) => {
      setActiveCard(index);
      startProgress(durationMs);
      const timer = window.setTimeout(advanceCard, durationMs);
      clearAutoNext = () => window.clearTimeout(timer);
    };

    const scheduleAutoNextAt = (index: number) => {
      clearAutoNextSchedule();
      setActiveCard(index);
      if (
        !postsStore.cardAutoNext ||
        props.autoNextPaused ||
        props.loading ||
        typeof document === "undefined" ||
        document.visibilityState !== "visible" ||
        !props.visiblePosts.length
      ) {
        return;
      }
      if (userPaused.value || hoverPaused.value) {
        return;
      }
      lastDwellIndex = index;
      const video = cardEl(index)?.querySelector("video");
      if (video && !video.ended) {
        autoNextProgress.value = 0;
        let cancelled = false;
        const onEnded = () => {
          video.removeEventListener("ended", onEnded);
          if (!cancelled) advanceCard();
        };
        clearAutoNext = () => {
          cancelled = true;
          video.removeEventListener("ended", onEnded);
        };
        const playResult = video.play();
        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              if (cancelled) return;
              video.addEventListener("ended", onEnded);
            })
            .catch(() => {
              if (cancelled) return;
              scheduleImageDwell(index, postsStore.cardAutoNextIntervalMs);
            });
          return;
        }
        video.addEventListener("ended", onEnded);
        return;
      }
      scheduleImageDwell(index, postsStore.cardAutoNextIntervalMs);
    };

    const pauseAutoNext = () => {
      if (!postsStore.cardAutoNext) return;
      if (progressRaf) {
        cancelAnimationFrame(progressRaf);
        progressRaf = 0;
      }
      if (dwellRemainingMs > 0 && dwellStartedAt) {
        const elapsed = performance.now() - dwellStartedAt;
        dwellRemainingMs = Math.max(0, dwellRemainingMs - elapsed);
      }
      clearAutoNext?.();
      clearAutoNext = null;
    };

    const resumeAutoNext = () => {
      if (!canRunAutoNext() || props.loading) return;
      const index = currentCardIndex();
      lastDwellIndex = index;
      const video = cardEl(index)?.querySelector("video");
      if (video && !video.ended) {
        scheduleAutoNextAt(index);
        return;
      }
      const remaining =
        dwellRemainingMs > 0 ? dwellRemainingMs : postsStore.cardAutoNextIntervalMs;
      scheduleImageDwell(index, remaining);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pauseAutoNext();
        persistResumeNow();
      } else if (!userPaused.value && !hoverPaused.value) {
        resumeAutoNext();
      }
    };

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (props.autoNextPaused) return;

      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const index = currentCardIndex();
        if (key === "j") {
          const next = index + 1;
          if (next >= props.visiblePosts.length) {
            context.emit("load-next-page");
            return;
          }
          lastDwellIndex = next;
          goToIndex(next);
          if (postsStore.cardAutoNext) scheduleAutoNextAt(next);
          if (props.resumeEnabled) scheduleResumeSave();
          return;
        }
        const prev = Math.max(0, index - 1);
        lastDwellIndex = prev;
        goToIndex(prev);
        if (postsStore.cardAutoNext) scheduleAutoNextAt(prev);
        if (props.resumeEnabled) scheduleResumeSave();
        return;
      }

      if (event.code !== "Space" && event.key !== " ") return;
      if (!postsStore.cardAutoNext) return;
      event.preventDefault();
      userPaused.value = !userPaused.value;
      if (userPaused.value) {
        pauseAutoNext();
      } else if (!hoverPaused.value) {
        resumeAutoNext();
      }
    };

    const onPointerOver = (event: Event) => {
      if (!postsStore.cardAutoNext) return;
      const index = currentCardIndex();
      const target = cardTarget(index);
      if (!target || !(event.target instanceof Node)) return;
      if (!target.contains(event.target)) return;
      if (hoverPaused.value) return;
      hoverPaused.value = true;
      pauseAutoNext();
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!hoverPaused.value) return;
      const index = currentCardIndex();
      const target = cardTarget(index);
      if (!target) {
        hoverPaused.value = false;
        if (!userPaused.value) resumeAutoNext();
        return;
      }
      const related = event.relatedTarget;
      if (related instanceof Node && target.contains(related)) return;
      hoverPaused.value = false;
      if (!userPaused.value) resumeAutoNext();
    };

    watch(
      () => [
        postsStore.cardAutoNext,
        postsStore.cardAutoNextIntervalMs,
        props.autoNextPaused,
      ],
      () => {
        lastDwellIndex = -1;
        dwellRemainingMs = 0;
        if (!postsStore.cardAutoNext) {
          userPaused.value = false;
          hoverPaused.value = false;
          autoNextActiveId.value = null;
          clearAutoNextSchedule();
          return;
        }
        scheduleAutoNext();
      },
    );

    watch(
      () => [props.loading, props.restorePath, props.visiblePosts.length] as const,
      () => {
        void tryRestore();
      },
    );

    watch(
      () => props.loading,
      (loading, wasLoading) => {
        if (wasLoading && !loading && waitingForMorePosts) {
          const index = currentCardIndex();
          if (index + 1 < props.visiblePosts.length) {
            waitingForMorePosts = false;
            lastDwellIndex = index + 1;
            goToIndex(index + 1);
            scheduleAutoNextAt(index + 1);
            return;
          }
          waitingForMorePosts = false;
        }
        if (!loading) {
          scheduleAutoNext();
          if (props.resumeEnabled) attachVideoTimeListener();
        } else {
          clearAutoNextSchedule();
        }
      },
    );

    const indexThatTriggersPreviousPage = computed(() =>
      props.visiblePosts.length > 2 ? 1 : 0,
    );
    const indexThatTriggersNextPage = computed(() =>
      props.visiblePosts.length > 2
        ? props.visiblePosts.length - 2
        : props.visiblePosts.length - 1,
    );

    const triggerLoad = (
      index: number,
      name: "enter" | "leave",
      event: IntersectionObserverEntry,
    ) => {
      if (props.loading) return;
      if (index === indexThatTriggersNextPage.value && name === "enter" && canTriggerLoad.value.next) {
        context.emit("load-next-page");
        canTriggerLoad.value.next = false;
      } else if (index === indexThatTriggersPreviousPage.value) {
        if (name === "enter") {
          if (hasLeftElementThatTriggersPreviousPage.value && canTriggerLoad.value.previous) {
            context.emit("load-previous-page");
            canTriggerLoad.value.previous = false;
          }
        } else {
          hasLeftElementThatTriggersPreviousPage.value = true;
        }
      }
    };

    const shouldHaveIntersectionObserver = (index: number) => {
      if(!postsStore.autoLoad) return false;
      return (
        index === indexThatTriggersPreviousPage.value ||
        index === indexThatTriggersNextPage.value
      );
    };

    return {
      layout,
      size,
      posts,
      fullWidthFeed,
      addElement,
      triggerLoad,
      shouldHaveIntersectionObserver,
    };
  },
});
</script>
