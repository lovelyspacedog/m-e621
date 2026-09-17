<template>
  <!-- Background comes from --me621-bg on :root (set below). Extensions can
       override with `:root { --me621-bg: transparent !important; }` because
       we do not redeclare the variable on this element. -->
  <v-main class="me621-main">
    <router-view v-slot="{ Component, route }">
      <transition
        :enter-active-class="enterTransitionName"
        :leave-active-class="leaveTransitionName"
        mode="out-in"
      >
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </v-main>
</template>

<script setup lang="ts">
import { useAppearanceStore } from "@/services";
import { getTransitionName } from "@/misc/util/transitions";
import { prefersReducedMotion } from "@/misc/util/reducedMotion";
import { computed, watchEffect } from "vue";

const appearance = useAppearanceStore();
const backgroundColor = computed(() => appearance.backgroundColor);

const routeClasses = computed(() => {
  if (prefersReducedMotion()) {
    return getTransitionName("none", "none");
  }
  return getTransitionName(appearance.routeTransition || "fade", "none");
});
const enterTransitionName = computed(() => routeClasses.value.enterTransitionName);
const leaveTransitionName = computed(() => routeClasses.value.leaveTransitionName);

watchEffect(() => {
  document.documentElement.style.setProperty("--me621-bg", backgroundColor.value);
});
</script>
