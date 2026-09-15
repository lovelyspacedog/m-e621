import { defineComponent, h } from "vue";

/**
 * Simple Itaku mark (stylized "i") for site-mode switcher.
 */
export const ItakuIcon = defineComponent({
  name: "ItakuIcon",
  setup() {
    return () =>
      h(
        "svg",
        {
          class: "v-icon__svg",
          xmlns: "http://www.w3.org/2000/svg",
          viewBox: "0 0 32 32",
          role: "img",
          "aria-hidden": "true",
        },
        [
          h("circle", {
            cx: "16",
            cy: "16",
            r: "14",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2.5",
          }),
          h("circle", {
            cx: "16",
            cy: "9",
            r: "2.2",
            fill: "currentColor",
          }),
          h("path", {
            fill: "currentColor",
            d: "M14.2 13.5h3.6v11h-3.6z",
          }),
        ],
      );
  },
});
