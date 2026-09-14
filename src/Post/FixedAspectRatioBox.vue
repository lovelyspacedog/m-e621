<template>
  <div
    class="aspect-ratio-box"
    :style="{ 'padding-top': `calc(${safeRatio} * 100%)` }"
  >
    <slot />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from "vue";

export default defineComponent({
  props: {
    ratio: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const safeRatio = computed(() => {
      const value = props.ratio;
      return Number.isFinite(value) && value > 0 ? value : 1;
    });
    return { safeRatio };
  },
});
</script>

<style>
/* TODO: scoped? */
.aspect-ratio-box {
  height: 0;
  overflow: hidden;
  position: relative;
}
.aspect-ratio-box > * {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
</style>
