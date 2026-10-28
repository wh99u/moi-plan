/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID for «Войти через Google»; without it the name is typed by hand. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
