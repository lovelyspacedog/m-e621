<template>
    <v-tooltip location="bottom">
        <template #activator="{ props }">
            <span v-bind="props">{{ relativeDate }}</span>
        </template>
        <span>{{ absoluteDate }}</span>
    </v-tooltip>
</template>

<script lang="ts">
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { computed, defineComponent } from "vue";

export default defineComponent({
    props: {
        value: {
            type: String,
            required: true,
        }
    },
    setup(props, context) {
        const date = computed(() => {
            const raw = (props.value || "").trim();
            if (!raw) return null;
            const parsed = parseISO(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        });
        const relativeDate = computed(() =>
            date.value
                ? formatDistanceToNow(date.value, { addSuffix: true })
                : "Unknown date",
        );
        const absoluteDate = computed(() =>
            date.value ? format(date.value, "PP p") : "Unknown date",
        );
        return {
            relativeDate,
            absoluteDate,
        };
    },
});
</script>
