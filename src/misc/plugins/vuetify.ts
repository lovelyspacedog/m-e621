import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import '@fontsource/roboto/latin.css'
import "@mdi/font/css/materialdesignicons.min.css";
import { defaultSettings } from "@/services/defaultSettings";
import { md3 } from 'vuetify/blueprints'
import { FoxIcon } from "@/misc/icons/FoxIcon";
import { TanukiAiIcon } from "@/misc/icons/TanukiAiIcon";

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
