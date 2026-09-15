<template>
    <section class="mt-8 mb-4">
        <v-container>
            <v-row>
                <v-col cols="12" md="6" offset-md="3">
                    <div class="mb-3">
                        <h2 class="text-h4 text-center">What is m-e621?</h2>
                    </div>
                    <p class="text-center">
                        m-e621 is a personal, AI-first fork of Material e621 — a modern
                        open source web client for e621.net and related sites. It adds
                        multi-site modes and local tools on top of the upstream browsing
                        experience.
                    </p>
                    <p class="text-center">
                        Further information can be found on this fork's
                        <a class="text-primary text-decoration-none" target="_blank"
                            href="https://github.com/lovelyspacedog/m-e621">
                            <v-icon color="primary" size="1em" class="mr-1">
                                mdi-open-in-new </v-icon><span class="text-decoration-underline">GitHub page</span></a>.
                    </p>
                </v-col>
            </v-row>
            <v-row>
                <v-col cols="12" md="6" offset-md="3">
                    <div class="mb-3">
                        <h2 class="text-h4 text-center">Looking for more?</h2>
                    </div>
                    <p class="text-center">
                        The original site can be found
                        <a class="text-primary text-decoration-none" target="_blank" :href="url.e621Url">
                            <v-icon color="primary" size="1em" class="mr-1">
                                mdi-open-in-new </v-icon><span class="text-decoration-underline">here</span></a>. While
                        m-e621
                        provides an enhanced interface for browsing
                        posts, e621.net has more features that go beyond that, such as
                        image uploads, comments, and a forum (among others). If you need
                        any of those, use e621.net directly as most of these features will
                        never be available in m-e621.
                    </p>
                </v-col>
            </v-row>
        </v-container>
    </section>

</template>

<script setup lang="ts">
import { useUrlStore } from '@/services';

const url = useUrlStore();
</script>
