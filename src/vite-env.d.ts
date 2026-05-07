/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly APP_VERSION: string;
	readonly APP_GIT_HASH: string;
	readonly APP_ENV: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
