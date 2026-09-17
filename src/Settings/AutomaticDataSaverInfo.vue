<template>
  <div>
    <p>
      "Automatic" uses the Network Information API
      (<code>navigator.connection</code>). Most browsers expose
      <code>effectiveType</code> and/or Save-Data; <code>connection.type</code>
      is rare. When nothing is available it falls back to medium quality.
    </p>
    <ul>
      <li>Bluetooth or cellular: low</li>
      <li>Ethernet or wifi: high (medium if Save-Data is on)</li>
      <li>effectiveType slow-2g / 2g: low; 3g: medium; 4g: high</li>
      <li>Unsupported: medium (low if Save-Data is on)</li>
    </ul>
    <p>
      Current connection type:
      <span
        :class="dataSaverInfo.typeSupported ? 'success--text' : 'error--text'"
        :title="dataSaverInfo.typeSupported ? 'Supported' : 'Not supported'"
        >{{ dataSaverInfo.type }}</span
      >
      · effectiveType:
      <span
        :class="
          dataSaverInfo.effectiveTypeSupported ? 'success--text' : 'error--text'
        "
        :title="
          dataSaverInfo.effectiveTypeSupported ? 'Supported' : 'Not supported'
        "
        >{{ dataSaverInfo.effectiveType || "n/a" }}</span
      >
      · Save-Data: {{ dataSaverInfo.saveData ? "on" : "off" }}
      · chosen: {{ autoQuality }}
    </p>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from "vue";
import {
  resolveAutoQuality,
  useDataSaverInfo,
} from "@/misc/util/dataSaver";

export default defineComponent({
  props: {},
  setup() {
    const { dataSaverInfo } = useDataSaverInfo();
    const autoQuality = computed(() => resolveAutoQuality(dataSaverInfo.value));
    return {
      dataSaverInfo,
      autoQuality,
    };
  },
});
</script>
