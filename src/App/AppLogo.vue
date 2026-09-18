<template>
  <div :style="{ height: `${size}px` }">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 1000"
      class="margin-auto"
      :class="{ loader: type === 'loader' }"
      :style="{ height: `${size}px` }"
      role="img"
      aria-label="Baxter, PawFeed mascot"
    >
      <!-- Baxter: clearer tail (stem + tip below left ear). Face only. -->
      <g class="tail" v-if="type === 'face'">
        <path
          d="M 340 900
             C 280 930 200 955 130 945
             C 70 935 40 880 55 830
             C 70 785 120 780 160 810
             C 210 850 280 880 340 900 Z"
          fill="rgb(5, 55, 98)"
        />
        <ellipse cx="70" cy="820" rx="50" ry="44" fill="rgb(232, 49, 253)" />
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

      <!-- Longer thinner basset ears + soft crease at the hex join -->
      <g class="left-ear">
        <path
          d="M 250 365
             C 165 400 95 510 85 650
             C 75 790 125 940 225 965
             C 280 980 315 920 322 820
             C 335 690 325 530 290 420
             C 275 385 260 368 250 365 Z"
          fill="rgb(232, 49, 253)"
        />
        <path
          d="M 258 400
             C 195 435 140 530 132 650
             C 124 770 165 885 228 905
             C 270 918 295 870 300 790
             C 310 680 302 545 280 445
             C 272 415 265 402 258 400 Z"
          fill="rgb(255, 205, 241)"
        />
        <path
          d="M 250 365
             C 235 390 245 430 270 445
             C 255 400 255 375 250 365 Z"
          fill="rgb(190, 25, 210)"
          opacity="0.85"
        />
      </g>

      <g class="right-ear">
        <path
          d="M 750 365
             C 835 400 905 510 915 650
             C 925 790 875 940 775 965
             C 720 980 685 920 678 820
             C 665 690 675 530 710 420
             C 725 385 740 368 750 365 Z"
          fill="rgb(232, 49, 253)"
        />
        <path
          d="M 742 400
             C 805 435 860 530 868 650
             C 876 770 835 885 772 905
             C 730 918 705 870 700 790
             C 690 680 698 545 720 445
             C 728 415 735 402 742 400 Z"
          fill="rgb(255, 205, 241)"
        />
        <path
          d="M 750 365
             C 765 390 755 430 730 445
             C 745 400 745 375 750 365 Z"
          fill="rgb(190, 25, 210)"
          opacity="0.85"
        />
      </g>

      <!-- PawFeed wordmark (Fredoka) -->
      <g v-if="type === 'text'" class="wordmark">
        <text
          x="500"
          y="560"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="Fredoka, sans-serif"
          font-weight="600"
          font-size="96"
          letter-spacing="1"
          fill="rgb(255,255,255)"
        >
          PawFeed
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
@font-face {
  font-family: "Fredoka";
  src: url("@/assets/fonts/Fredoka-SemiBold.ttf") format("truetype");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

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
  animation: load-logo 1.1s infinite ease-in-out;
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
  transform: translate(0) rotateZ(0deg);
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
/* Loader pulse with a clearer head tilt */
@keyframes load-logo {
  from,
  to {
    transform: scale(0.72) rotate(0deg);
    opacity: 0.2;
  }
  50% {
    transform: scale(1) rotate(-14deg);
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
/* Mostly single blinks; rare double-blink near the end of the cycle */
@keyframes close-eyes {
  0%,
  1%,
  19%,
  21%,
  39%,
  41%,
  59%,
  61%,
  79%,
  80.5%,
  82%,
  83.5%,
  85%,
  99%,
  100% {
    transform: translate(0) rotateZ(0deg);
  }
  20%,
  40%,
  60%,
  81%,
  83%,
  84.2% {
    /* ~18% of viewBox height clears brows and covers the eyes */
    transform: translateY(18%) rotateZ(0deg);
  }
}
</style>
