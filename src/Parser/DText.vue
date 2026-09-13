<script lang="ts">
import { getTagColorFromCategory } from "@/misc/util/utilities";
import type { VNode } from "vue";
import { computed, defineComponent, h } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import { useUrlStore } from "@/services";
import {
  VCard,
  VCardText,
  VExpansionPanel,
  VExpansionPanels,
  VExpansionPanelText,
  VExpansionPanelTitle,
} from "vuetify/components";

const TAG_CATEGORIES = ["artist", "character", "copyright", "species"];

const validBbElements = [
  "b",
  "i",
  "u",
  "s",
  "o",
  "sup",
  "sub",
  "spoiler",
  "color",
  "quote",
  "code",
  "section",
  "table",
];

type TreeNode = VNode | string;

const createTree = (text: string, baseUrl: string): TreeNode[] => {
  if (!text) return [];
  for (const matcher of customMatchers) {
    matcher.regex.lastIndex = 0;
    const match = matcher.regex.exec(text);
    if (match && (!matcher.isValid || matcher.isValid(match))) {
      const startIndex = match.index ?? text.indexOf(match[0]);
      const endIndex = startIndex + match[0].length;
      return [
        ...createTree(text.substring(0, startIndex), baseUrl),
        matcher.render(match, baseUrl),
        ...createTree(text.substring(endIndex), baseUrl),
      ];
    }
  }
  return [text];
};

const joinBase = (baseUrl: string, path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
};

const customBbElementGenerator: Record<
  string,
  (args: { innerText: string; attributes?: string; baseUrl: string }) => TreeNode
> = {
  color({ innerText, attributes, baseUrl }) {
    if (attributes && attributes.startsWith("=")) {
      let color = attributes.substring(1);
      if (TAG_CATEGORIES.includes(color)) {
        color = getTagColorFromCategory(color);
      }
      return h("span", { style: { color } }, createTree(innerText, baseUrl));
    }
    return h("span", {}, createTree(innerText, baseUrl));
  },
  o({ innerText, baseUrl }) {
    return h(
      "span",
      { style: { textDecoration: "overline" } },
      createTree(innerText, baseUrl),
    );
  },
  quote({ innerText, baseUrl }) {
    return h(VCard, { class: "elevation-8 my-2" }, () => [
      h(VCardText, {}, () => createTree(innerText, baseUrl)),
    ]);
  },
  code({ innerText }) {
    return h("code", { class: "code" }, innerText);
  },
  spoiler({ innerText, baseUrl }) {
    return h("span", { class: "spoiler" }, createTree(innerText, baseUrl));
  },
  table({ innerText, baseUrl }) {
    const rows = innerText
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean);
    if (!rows.length) return h("table");
    const parseCells = (row: string) =>
      row.split("|").map((cell) => cell.trim());
    const header = parseCells(rows[0]);
    const body = rows.slice(1).map(parseCells);
    return h("table", { class: "dtext-table" }, [
      h("thead", {}, [
        h(
          "tr",
          {},
          header.map((cell) => h("th", {}, createTree(cell, baseUrl))),
        ),
      ]),
      h(
        "tbody",
        {},
        body.map((cols) =>
          h(
            "tr",
            {},
            cols.map((cell) => h("td", {}, createTree(cell, baseUrl))),
          ),
        ),
      ),
    ]);
  },
  section({ innerText, attributes, baseUrl }) {
    let title = "Click to expand";
    let expanded = false;
    if (attributes) {
      if (attributes.startsWith(",expanded") || attributes.includes(",expanded")) {
        expanded = true;
      }
      const titleStartPosition = attributes.indexOf("=");
      if (titleStartPosition !== -1) {
        title = attributes.substring(titleStartPosition + 1);
      }
    }
    return h(
      VExpansionPanels,
      { modelValue: expanded ? 0 : undefined, variant: "popout", class: "my-2" },
      () => [
        h(VExpansionPanel, {}, () => [
          h(VExpansionPanelTitle, {}, () => title),
          h(VExpansionPanelText, {}, () => createTree(innerText, baseUrl)),
        ]),
      ],
    );
  },
};

const customMatchers: Array<{
  name: string;
  regex: RegExp;
  isValid?: (match: RegExpExecArray) => boolean;
  render: (match: RegExpExecArray, baseUrl: string) => TreeNode;
}> = [
  {
    name: "Code",
    regex: /`([^`]+)`/,
    render(match) {
      return customBbElementGenerator.code({ innerText: match[1], baseUrl: "" });
    },
  },
  {
    name: "Headers",
    regex: /^h([1-6])\.\s*(.*)$/im,
    render(match, baseUrl) {
      return h(`h${match[1]}`, {}, createTree(match[2], baseUrl));
    },
  },
  {
    name: "Lists",
    regex: /(?:^|\n)((?:\*+\s+.+(?:\n|$))+)/,
    render(match, baseUrl) {
      const input = match[1].trim();
      const listRegex = /^(\*+)\s+(.+)/gim;
      const items: TreeNode[] = [];
      let listMatch: RegExpExecArray | null;
      while ((listMatch = listRegex.exec(input))) {
        const depth = listMatch[1].length - 1;
        items.push(
          h(
            "li",
            { style: { marginLeft: `${depth}em` } },
            createTree(listMatch[2], baseUrl),
          ),
        );
      }
      return h("ul", items);
    },
  },
  {
    name: "BBElements",
    regex: /\[(\w+)((?:=| \w+=|,\w+=).*?)?\][\n\s]*([^]*?)[\n\s]*\[(\/\1)\]/im,
    isValid: (match) => validBbElements.includes(match[1].toLowerCase()),
    render(match, baseUrl) {
      const bbElement = match[1].toLowerCase();
      const attributes = match[2];
      const innerText = match[3];
      const generator = customBbElementGenerator[bbElement];
      if (typeof generator === "function") {
        return generator({ innerText, attributes, baseUrl });
      }
      return h(bbElement, createTree(innerText, baseUrl));
    },
  },
  {
    name: "@Username",
    regex: /@([a-zA-Z0-9\-_~']+)/,
    render(match, baseUrl) {
      return h(
        ExternalLink,
        { href: joinBase(baseUrl, `users/${match[1]}`) },
        () => [h("b", match[0])],
      );
    },
  },
  {
    name: "URLs",
    regex:
      /(?:"(.+?)":)?(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b[-a-zA-Z0-9@:%_+.~#?&//=]*)/,
    render(match) {
      return h(ExternalLink, { href: match[2] }, () => match[1] || match[2]);
    },
  },
  {
    name: "e621 URLs",
    regex: /"(.+?)":(\/[-a-zA-Z0-9@:%_+.~#?&//=]*)/,
    render(match, baseUrl) {
      return h(
        ExternalLink,
        { href: joinBase(baseUrl, match[2]) },
        () => match[1],
      );
    },
  },
];

export default defineComponent({
  name: "DText",
  props: {
    text: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const urlStore = useUrlStore();
    const fixedText = computed(() => props.text);
    const baseUrl = computed(() => urlStore.e621Url);
    return {
      fixedText,
      baseUrl,
    };
  },
  render() {
    if (this.enabled) {
      return h(
        "span",
        { class: "dtext", style: { whiteSpace: "pre-wrap" } },
        createTree(this.fixedText as string, this.baseUrl),
      );
    }
    return h(
      "span",
      { class: "dtext", style: { whiteSpace: "pre-wrap" } },
      this.fixedText as string,
    );
  },
});
</script>

<style scoped>
.dtext :deep(.spoiler) {
  transition: background 0.3s ease-in-out, color 0.3s ease-in-out;
}

.dtext :deep(.spoiler a) {
  transition: background 0.3s ease-in-out, color 0.3s ease-in-out;
}

.dtext :deep(.spoiler:not(:hover)) {
  color: black;
  background-color: black;
}

.dtext :deep(.spoiler:not(:hover) a) {
  color: black;
}

.dtext :deep(.dtext-table) {
  border-collapse: collapse;
  margin: 0.5em 0;
}

.dtext :deep(.dtext-table th),
.dtext :deep(.dtext-table td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 0.25em 0.5em;
}
</style>
