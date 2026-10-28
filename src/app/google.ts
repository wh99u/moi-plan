/**
 * «Sign in with Google» via Google Identity Services. The ID token is a JWT whose payload
 * carries the account's display name («Иван Богоцкий») and photo; we only read it for display.
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth client of type «Web application» whose authorised
 * JavaScript origins include this site).
 */

export interface GoogleProfile {
  name: string;
  givenName?: string;
  picture?: string;
  email?: string;
}

interface IdPayload {
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
}

/** Base64url JWT payload → object, decoded as UTF-8 so Cyrillic names survive. */
export function decodeJwtPayload<T = unknown>(token: string): T | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function profileFromCredential(credential: string): GoogleProfile | null {
  const p = decodeJwtPayload<IdPayload>(credential);
  if (!p) return null;
  const name = (p.name || [p.given_name, p.family_name].filter(Boolean).join(' ')).trim();
  if (!name) return null;
  return { name, givenName: p.given_name, picture: p.picture, email: p.email };
}

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

interface Gsi {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; ux_mode?: 'popup'; use_fedcm_for_prompt?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, string | number>): void;
      prompt(): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gsi;
  }
}

let loading: Promise<Gsi> | null = null;

function loadGsi(): Promise<Gsi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('gsi')));
    s.onerror = () => {
      loading = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

let onProfile: ((p: GoogleProfile) => void) | null = null;
let initialised = false;

/** Draws Google's own sign-in button into `el`; `done` gets the profile after a successful sign-in. */
export async function renderGoogleButton(el: HTMLElement, done: (p: GoogleProfile) => void) {
  if (!GOOGLE_CLIENT_ID) return false;
  const gsi = await loadGsi();
  onProfile = done;
  if (!initialised) {
    gsi.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
      callback: (r) => {
        const p = profileFromCredential(r.credential);
        if (p) onProfile?.(p);
      },
    });
    initialised = true;
  }
  gsi.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_black', shape: 'pill', size: 'large', text: 'signin_with', locale: 'ru', logo_alignment: 'left' });
  return true;
}

export function googleSignOut() {
  window.google?.accounts.id.disableAutoSelect();
}
