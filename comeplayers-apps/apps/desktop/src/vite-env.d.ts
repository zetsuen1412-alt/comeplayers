/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMEPLAYERS_WEB_URL?: string;
  readonly VITE_COMEPLAYERS_DEV_URL?: string;
  readonly VITE_COMEPLAYERS_API_URL?: string;
  readonly VITE_COMEPLAYERS_DISTRIBUTION?: "direct" | "store";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
