<template>
  <div class="heatmap">
    <div class="heatmap-months">
      <span class="heatmap-weekday-spacer" />
      <div class="heatmap-month-row">
        <span
          v-for="(label, idx) in monthLabels"
          :key="idx"
          class="heatmap-month"
          :style="{ flex: label.span }"
        >
          {{ label.text }}
        </span>
      </div>
    </div>
    <div class="heatmap-body">
      <div class="heatmap-weekdays">
        <span
          v-for="(label, idx) in weekdayLabels"
          :key="idx"
          class="heatmap-weekday"
        >
          {{ label }}
        </span>
      </div>
      <div class="heatmap-grid">
        <div
          v-for="(col, idx) in matrix"
          :key="idx"
          class="heatmap-col"
        >
          <button
            v-for="(day, i) in col"
            :key="i"
            type="button"
            class="heatmap-cell"
            :class="{
              'heatmap-cell--empty': !day.count,
              'heatmap-cell--selected': day.key && day.key === selectedDay,
            }"
            :style="cellStyle(day.count)"
            :title="`${day.count} uploads on ${day.label}`"
            @click="onDayClick(day)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { eachDayOfInterval, format, getDay, subDays } from "date-fns";
import { chunk } from "lodash";
import type { PropType } from "vue";
import { computed, defineComponent } from "vue";

type HeatDay = {
  key: string;
  label: string;
  count: number;
};

export default defineComponent({
  props: {
    heatmap: {
      type: Object as PropType<{
        [date: string]: number | undefined;
      }>,
      required: true,
    },
    max: {
      type: Number,
      required: true,
    },
    selectedDay: {
      type: String as PropType<string | null>,
      default: null,
    },
  },
  emits: {
    "select-day": (day: string | null) => {
      void day;
      return true;
    },
  },
  setup(props, { emit }) {
    const days = computed(() =>
      eachDayOfInterval({
        start: subDays(new Date(), 370),
        end: new Date(),
      }).map((date) => {
        const key = format(date, "yyyy-MM-dd");
        return {
          key,
          label: format(date, "PP"),
          count: props.heatmap[key] ?? 0,
        } satisfies HeatDay;
      }),
    );

    // Align so columns are weeks starting Sunday (GitHub-style).
    const matrix = computed(() => {
      const list = [...days.value];
      const firstDow = getDay(subDays(new Date(), 370));
      for (let i = 0; i < firstDow; i++) {
        list.unshift({ key: "", label: "", count: 0 });
      }
      return chunk(list, 7);
    });

    const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

    const monthLabels = computed(() => {
      const labels: { text: string; span: number }[] = [];
      for (const col of matrix.value) {
        const mid = col.find((d) => d.key)?.key;
        if (!mid) {
          labels.push({ text: "", span: 1 });
          continue;
        }
        const text = format(new Date(mid + "T12:00:00"), "MMM");
        const last = labels[labels.length - 1];
        if (last && last.text === text) {
          last.span += 1;
        } else {
          labels.push({ text, span: 1 });
        }
      }
      return labels;
    });

    const cellStyle = (count: number) => {
      if (!count || !props.max) {
        return { opacity: 1 };
      }
      const ratio = count / props.max;
      let level = 1;
      if (ratio > 0.75) level = 4;
      else if (ratio > 0.5) level = 3;
      else if (ratio > 0.25) level = 2;
      return { ["--heat-level" as string]: String(level) };
    };

    const onDayClick = (day: HeatDay) => {
      if (!day.key) return;
      emit("select-day", day.key === props.selectedDay ? null : day.key);
    };

    return {
      matrix,
      weekdayLabels,
      monthLabels,
      cellStyle,
      onDayClick,
    };
  },
});
</script>

<style scoped>
.heatmap {
  width: 100%;
  overflow-x: auto;
}
.heatmap-months {
  display: flex;
  align-items: flex-end;
  margin-bottom: 4px;
}
.heatmap-weekday-spacer {
  width: 28px;
  flex-shrink: 0;
}
.heatmap-month-row {
  display: flex;
  flex: 1;
  min-width: 0;
  font-size: 0.7rem;
  opacity: 0.7;
}
.heatmap-month {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
}
.heatmap-body {
  display: flex;
  gap: 4px;
}
.heatmap-weekdays {
  display: flex;
  flex-direction: column;
  width: 28px;
  flex-shrink: 0;
  font-size: 0.65rem;
  opacity: 0.7;
  justify-content: space-between;
}
.heatmap-weekday {
  height: 12px;
  line-height: 12px;
}
.heatmap-grid {
  display: flex;
  flex: 1;
  gap: 2px;
  min-width: 0;
}
.heatmap-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 2px;
  min-width: 0;
}
.heatmap-cell {
  aspect-ratio: 1;
  width: 100%;
  border: none;
  padding: 0;
  border-radius: 2px;
  cursor: pointer;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.heatmap-cell:not(.heatmap-cell--empty) {
  background: rgb(var(--v-theme-primary));
  opacity: calc(0.25 + var(--heat-level, 1) * 0.2);
}
.heatmap-cell--selected {
  outline: 2px solid rgb(var(--v-theme-accent));
  outline-offset: 1px;
}
</style>
