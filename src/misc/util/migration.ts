import { usePersistanceService } from "@/services";
import type { ISettingsServiceState } from "@/services/types";

type MigrationMessage =
    | { type: "requestMigrationData" }
    | { type: "migrationDataResponse"; migrationData: ISettingsServiceState };

export const useMigrator = () => {
    const persistanceService = usePersistanceService();

    function requestMigrationDataViaIframe(
        oldDomainUrl: string,
        onSuccess: () => void,
        onError: () => void,
        maxRetries = 5,
        retryIntervalMs = 1000,
    ): void {
        const expectedOrigin = new URL(oldDomainUrl).origin;

        const openMigrationWindow = () => {
            let success = false;
            const onMessage = (event: MessageEvent<MigrationMessage>) => {
                if (event.origin !== expectedOrigin) return;
                if (event.data?.type !== "migrationDataResponse") return;
                window.removeEventListener("message", onMessage);
                persistanceService.setState(event.data.migrationData);
                success = true;
                onSuccess();
                w?.close();
            };
            window.addEventListener("message", onMessage);
            const w = window.open(oldDomainUrl, "_blank");
            setTimeout(() => {
                if (!success) {
                    window.removeEventListener("message", onMessage);
                    fallbackToIframe();
                    w?.close();
                }
            }, 10000);
        }

        openMigrationWindow();

        const fallbackToIframe = () => {
            const iframe = document.createElement("iframe");
            iframe.src = oldDomainUrl;
            iframe.style.display = "none";
            document.body.appendChild(iframe);

            const messageHandler = (event: MessageEvent<MigrationMessage>) => {
                if (event.origin !== expectedOrigin) return;
                if (event.data?.type !== "migrationDataResponse") return;

                window.removeEventListener("message", messageHandler);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }

                persistanceService.setState(event.data.migrationData);
                onSuccess();
            };

            window.addEventListener("message", messageHandler);

            let attempts = 0;
            const sendRequest = () => {
                if (attempts >= maxRetries) {
                    window.removeEventListener("message", messageHandler);
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                    onError();
                    return;
                }

                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: "requestMigrationData" }, expectedOrigin);
                    attempts++;
                    setTimeout(sendRequest, retryIntervalMs);
                } else {
                    setTimeout(sendRequest, retryIntervalMs);
                }
            };

            iframe.onload = () => {
                sendRequest();
            };
        }
    }

    function setupMigrationDataListener(allowedOrigin: string): void {
        const timer = window.setInterval(() => {
            if (!window.opener || window.opener.closed) {
                window.clearInterval(timer);
                return;
            }
            const state = persistanceService.getState();
            if (hasMigratableState(state)) {
                const response: MigrationMessage = {
                    type: "migrationDataResponse",
                    migrationData: state
                };

                window.opener.postMessage(response, {
                    targetOrigin: allowedOrigin
                });
            }
        }, 1000);
        window.addEventListener("message", (event: MessageEvent<MigrationMessage>) => {
            if (event.origin !== allowedOrigin) return;

            if (event.data?.type === "requestMigrationData") {
                const state = persistanceService.getState();
                if (hasMigratableState(state)) {
                    const response: MigrationMessage = {
                        type: "migrationDataResponse",
                        migrationData: state
                    };

                    event.source?.postMessage(response, {
                        targetOrigin: allowedOrigin
                    });
                }
            }
        });
    }

    return {
        requestMigrationDataViaIframe,
        setupMigrationDataListener
    };
}

const hasFavoriteTags = (
    favorites: { tags?: unknown[] } | null | undefined,
): boolean => (favorites?.tags?.length ?? 0) > 0;

/** True if there is anything worth migrating (not an empty library). */
export function hasMigratableState(state: ISettingsServiceState): boolean {
    if (state.history?.entries?.length > 0) return true;
    if (state.account?.apiKey || state.account?.username) return true;
    if (state.blacklist?.tags?.length > 0) return true;
    if (state.searches?.entries?.length > 0) return true;
    if (hasFavoriteTags(state.favorites)) return true;
    if (state.savedPosts?.entries?.length > 0) return true;
    if (state.watchedPools?.entries?.length > 0) return true;
    if (state.watchedComics?.entries?.length > 0) return true;
    if (state.watchedU18chan?.entries?.length > 0) return true;
    if (state.news?.saved?.length > 0) return true;
    const profiles = state.profiles;
    if (profiles) {
        for (const profile of Object.values(profiles)) {
            if (!profile) continue;
            if (profile.account?.apiKey || profile.account?.username) return true;
            if (profile.blacklist?.tags?.length > 0) return true;
            if (profile.searches?.entries?.length > 0) return true;
            if (profile.history?.entries?.length > 0) return true;
            if (hasFavoriteTags(profile.favorites)) return true;
        }
    }
    return false;
}
