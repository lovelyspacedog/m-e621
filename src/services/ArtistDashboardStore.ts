import { defineStore } from "pinia";
import { computed } from "vue";
import {
  DASHBOARD_RECENT_ARTISTS_MAX,
  recordRecentArtist,
} from "@/misc/util/dashboardMetrics";
import { useMainStore } from "./state";

export const useArtistDashboardStore = defineStore("artistDashboard", () => {
  const main = useMainStore();

  const recentArtists = computed(() => main.artistDashboard.recentArtists);

  const recordVisit = (name: string) => {
    main.artistDashboard.recentArtists = recordRecentArtist(
      main.artistDashboard.recentArtists,
      name,
      DASHBOARD_RECENT_ARTISTS_MAX,
    );
  };

  const removeRecent = (name: string) => {
    main.artistDashboard.recentArtists =
      main.artistDashboard.recentArtists.filter((n) => n !== name);
  };

  return {
    recentArtists,
    recordVisit,
    removeRecent,
  };
});
