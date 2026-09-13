/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_GIT_COMMIT_INFO: string
    readonly VITE_GIT_BRANCH: string
    readonly VITE_ENABLE_GIT_PULL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
