<template>
    <v-fade-transition mode="out-in">
        <div v-if="pool" key="content">
            <v-card color="transparent" elevation="0" style="max-width: 50vw;">
                <v-card-title class="flex-column align-baseline">
                    <span style="line-height: initial">{{ pool.name }}</span>
                    <small class="text-caption" style="line-height: initial;">
                        {{ pool.post_count }} Posts &bull; created by {{ pool.creator_name }}
                    </small>
                </v-card-title>
                <v-card-text style="max-height: 20vh; overflow-y: auto;">
                    <DText :text="pool.description || 'No description'" />
                </v-card-text>
                <v-card-actions v-if="showBrowse">
                    <v-btn
                        color="accent"
                        variant="text"
                        :to="{ name: 'Pool', params: { id: poolId } }"
                    >
                        Browse pool
                    </v-btn>
                </v-card-actions>
            </v-card>
        </div>
        <div v-else-if="loading" key="loading">
            <AppLogo type="loader" />
        </div>
    </v-fade-transition>
</template>

<script lang="ts">
import AppLogo from "@/App/AppLogo.vue";
import DText from "@/Parser/DText.vue";
import { useUrlStore } from "@/services";
import type { Pool } from "@/worker/api";
import { getApiService } from "@/worker/services";
import { defineComponent, onMounted, ref, watch } from "vue";

export default defineComponent({
    props: {
        poolId: {
            type: Number,
            required: true,
        },
        showBrowse: {
            type: Boolean,
            default: true,
        },
    },
    setup(props) {
        const urlStore = useUrlStore();
        const pool = ref<Pool>();
        const loading = ref(false);
        const getInfo = async () => {
            try {
                loading.value = true;
                pool.value = undefined;
                const service = await getApiService();
                pool.value = await service.getPool({
                    id: props.poolId,
                    baseUrl: urlStore.e621Url,
                });
            } catch (err) {
                console.log(err);
            } finally {
                loading.value = false;
            }
        };
        onMounted(() => {
            getInfo();
        });
        watch(
            () => props.poolId,
            () => {
                getInfo();
            },
        );
        return {
            pool,
            loading
        };
    },
    components: { DText, AppLogo }
});
</script>
