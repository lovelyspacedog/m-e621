<template>
  <div :style="{ height: `${size}px` }">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 1000"
      class="margin-auto"
      :class="{ loader: type === 'loader' }"
      :style="{ height: `${size}px` }"
      role="img"
      aria-label="PawFeed"
    >
      <!-- Tail (face only) -->
      <g class="tail" v-if="type === 'face'">
        <path
          d="M 290 780 C 200 800 120 760 100 700 C 80 640 140 600 190 620 C 230 640 260 700 290 760 Z"
          fill="rgb(5, 55, 98)"
        />
        <ellipse cx="105" cy="700" rx="42" ry="38" fill="rgb(232, 49, 253)" />
      </g>

      <!-- Pointy-top hexagon head. Heritage e621 blue contrasts theme primary (#1976d2). -->
      <path
        class="background"
        d="M 500 180
           L 730 310
           L 810 560
           L 730 810
           L 500 940
           L 270 810
           L 190 560
           L 270 310
           Z"
        fill="rgb(0, 84, 159)"
      />

      <!-- Face under ears so the blink rect never paints over them.
           Loader uses the same face; otherwise the pulse is a blank hexagon.
           Brows paint after eyelids so the open-lid rect cannot cover them. -->
      <g class="face" v-if="type === 'face' || type === 'loader'">
        <ellipse class="eye" cx="375" cy="500" rx="38" ry="52" fill="rgb(0,0,0)" />
        <ellipse class="eye" cx="625" cy="500" rx="38" ry="52" fill="rgb(0,0,0)" />
        <!-- Open lids sit above the brows; blink slides them down over the eyes. -->
        <rect
          class="eyelids"
          x="340"
          y="270"
          width="320"
          height="130"
          fill="rgb(0, 84, 159)"
        />
        <path
          d="M 320 413 L 420 437 L 412 463 L 312 439 Z"
          fill="rgb(0,0,0)"
        />
        <path
          d="M 680 413 L 580 437 L 588 463 L 688 439 Z"
          fill="rgb(0,0,0)"
        />
        <path
          d="M 500 585
             C 462 585 438 613 438 633
             C 438 657 464 677 500 677
             C 536 677 562 657 562 633
             C 562 613 538 585 500 585 Z"
          fill="rgb(0,0,0)"
        />
        <path
          d="M 500 677 L 500 697
             M 448 717 Q 478 743 500 723 Q 522 743 552 717"
          fill="none"
          stroke="rgb(0,0,0)"
          stroke-width="12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <!-- Ears painted after face/eyelids -->
      <g class="left-ear">
        <path
          d="M 270 400
             C 200 430 130 520 120 640
             C 110 760 160 880 250 900
             C 300 910 330 860 340 780
             C 350 680 340 540 310 450
             C 300 420 285 405 270 400 Z"
          fill="rgb(232, 49, 253)"
        />
        <path
          d="M 275 430
             C 220 460 165 540 160 640
             C 155 740 195 830 255 845
             C 290 855 310 815 315 750
             C 322 670 315 550 295 470
             C 288 445 280 432 275 430 Z"
          fill="rgb(255, 205, 241)"
        />
      </g>

      <g class="right-ear">
        <path
          d="M 730 400
             C 800 430 870 520 880 640
             C 890 760 840 880 750 900
             C 700 910 670 860 660 780
             C 650 680 660 540 690 450
             C 700 420 715 405 730 400 Z"
          fill="rgb(232, 49, 253)"
        />
        <path
          d="M 725 430
             C 780 460 835 540 840 640
             C 845 740 805 830 745 845
             C 710 855 690 815 685 750
             C 678 670 685 550 705 470
             C 712 445 720 432 725 430 Z"
          fill="rgb(255, 205, 241)"
        />
      </g>

      <!-- Text wordmark -->
      <g v-if="type === 'text'" class="wordmark">
        <text
          x="500"
          y="620"
          text-anchor="middle"
          font-family="Roboto, Arial, sans-serif"
          font-weight="700"
          font-size="120"
          fill="rgb(255,255,255)"
        >
          e621
        </text>
      </g>
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  props: {
    type: {
      type: String,
      required: true,
      validator: (v: string) => ["loader", "face", "text"].indexOf(v) !== -1,
    },
    size: {
      type: [String, Number],
      default: 100,
    },
  },
});
</script>

<style scoped>
.margin-auto {
  margin: auto;
}
div {
  position: relative;
  overflow: hidden;
}
svg {
  width: 100%;
  padding-top: 5px;
}
svg.loader {
  animation: load-logo 1s infinite;
}
svg .tail {
  transform-box: fill-box;
  transform-origin: 90% 40%;
  transform: translate(0) scale(1) rotate(0);
  animation: wiggle-tail 10s infinite ease-in-out;
  animation-delay: 0s;
}
svg .eyelids {
  transform-origin: 100% 100%;
  transform: translate(0) scale(1) rotate(0);
  animation: close-eyes 30s infinite ease-in-out;
  animation-delay: 0s;
}
svg .left-ear,
svg .right-ear {
  transform-box: fill-box;
  transform: translate(0) scale(1) rotate(0);
  transition: all 0.5s ease !important;
}
svg .left-ear {
  transform-origin: 75% 8%;
  animation: wiggle-left 15s infinite ease-in-out;
  animation-delay: 1.05s;
}
svg .right-ear {
  transform-origin: 25% 8%;
  animation: wiggle-right 15s infinite ease-in-out;
  animation-delay: 1s;
}
@keyframes wiggle-right {
  from,
  to,
  6% {
    transform: translate(0) rotateZ(0deg);
  }
  1.8%,
  3%,
  4.5% {
    transform: translate(0) rotateZ(-10deg);
  }
  2.4%,
  3.6% {
    transform: translate(10px, -10px) rotateZ(10deg);
  }
}
@keyframes wiggle-left {
  from,
  to,
  6% {
    transform: translate(0) rotateZ(0deg);
  }
  1.8%,
  3%,
  4.5% {
    transform: translate(10px, -10px) rotateZ(10deg);
  }
  2.4%,
  3.6% {
    transform: translate(0) rotateZ(-10deg);
  }
}
@keyframes load-logo {
  from,
  to {
    transform: scale(0.7) rotate(0deg);
    opacity: 0.2;
  }
  50% {
    transform: scale(1) rotate(-10deg);
    opacity: 1;
  }
}
@keyframes wiggle-tail {
  from,
  to,
  34% {
    transform: translate(0) rotateZ(0deg);
  }
  6%,
  10%,
  14%,
  18%,
  22% {
    transform: translate(0) rotateZ(-8deg);
  }
  8%,
  12%,
  16%,
  20%,
  24% {
    transform: translate(0) rotateZ(8deg);
  }
  26%,
  30% {
    transform: translate(0) rotateZ(-4deg);
  }
  28%,
  32% {
    transform: translate(0) rotateZ(4deg);
  }
}
@keyframes close-eyes {
  1%,
  19%,
  21%,
  39%,
  41%,
  59%,
  61%,
  79%,
  81%,
  82%,
  84%,
  99% {
    transform: translate(0) rotateZ(0deg);
  }
  20%,
  40%,
  60%,
  80%,
  83%,
  100%,
  0% {
    /* ~18% of viewBox height clears brows and covers the eyes */
    transform: translateY(18%) rotateZ(0deg);
  }
}
</style>
