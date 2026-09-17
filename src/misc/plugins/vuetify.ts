import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import '@fontsource/roboto/latin.css'
import "@mdi/font/css/materialdesignicons.min.css";
import { defaultSettings } from "@/services/defaultSettings";
import { md3 } from 'vuetify/blueprints'
import { FoxIcon } from "@/misc/icons/FoxIcon";
import { TanukiAiIcon } from "@/misc/icons/TanukiAiIcon";
import { WeasylIcon } from "@/misc/icons/WeasylIcon";
import { ItakuIcon } from "@/misc/icons/ItakuIcon";
import { SofurryIcon } from "@/misc/icons/SofurryIcon";
import { FlayrahIcon } from "@/misc/icons/FlayrahIcon";

export const vuetify = createVuetify({
  blueprint: md3,
  theme: {
    defaultTheme: defaultSettings.appearance.dark ? "dark" : "light",
    themes: {
      dark: {
        colors: {
          primary: defaultSettings.appearance.primary,
          secondary: defaultSettings.appearance.secondary,
          accent: defaultSettings.appearance.accent,
        },
      },
      light: {
        colors: {
          primary: defaultSettings.appearance.primary,
          secondary: defaultSettings.appearance.secondary,
          accent: defaultSettings.appearance.accent,
        },
      },
    },
  },
  icons: {
    defaultSet: "mdi", // Icon sets changed
    aliases: {
      // @mdi/font has no fox; used for FurAffinity site mode
      fox: FoxIcon,
      // Iconify pajamas:tanuki-ai; used for e6ai site mode
      tanukiAi: TanukiAiIcon,
      // Iconify cib:weasyl (CC0 1.0); used for Weasyl site mode
      weasyl: WeasylIcon,
      // Iconify pinhead:bird-flying; used for Itaku site mode
      itaku: ItakuIcon,
      // Iconify game-icons:fluffy-flame; used for SoFurry site mode
      sofurry: SofurryIcon,
      // Iconify dashicons:carrot; used for Flayrah site mode
      flayrah: FlayrahIcon,
    },
  },
  defaults: {
    global: {
      transition: 'no',
      ripple: false,
    },
    VBtn: {
      variant: "text",
    },
    VCard: {
      color: "secondary",
    },
    VList: {
      bgColor: "secondary",
    },
    VTable: {
      class: "bg-secondary",
    },
    VChip: {
      variant: "elevated",
    },
    VSwitch: {
      color: "accent",
    }
  }
})
