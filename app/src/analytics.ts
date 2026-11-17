import type { Analytics } from 'firebase/analytics';
import { useEffect } from 'react';
import { useLocation } from 'react-router';

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** Off unless the build was given all four Firebase web config values. */
export const analyticsBuiltIn = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && v !== '',
);

type YesNo = 'yes' | 'no';

/** Never put names, emails, titles or ids in params; only a few fixed, low-cardinality values. */
export interface AnalyticsEvents {
  project_created: Record<string, never>;
  wall_added: Record<string, never>;
  obstruction_added: { obstruction_kind: 'door' | 'window' | 'outlet' | 'generic' };
  poster_added: { poster_shape: 'rect' | 'circle' | 'diamond'; has_image: YesNo };
  poster_image_set: Record<string, never>;
  poster_placed: Record<string, never>;
  dimensions_printed: { length_mode: 'inches' | 'feet-inches' };
  project_visibility_changed: { visibility: 'private' | 'public' };
}

const OPT_OUT_KEY = 'pwe.analyticsOff';

export function analyticsOptedOut(): boolean {
  return window.localStorage.getItem(OPT_OUT_KEY) === 'true';
}

let ready: Promise<{ analytics: Analytics; sdk: typeof import('firebase/analytics') }> | null = null;

function init() {
  ready ??= Promise.all([import('firebase/app'), import('firebase/analytics')]).then(([app, sdk]) => {
    sdk.setConsent({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    const analytics = sdk.initializeAnalytics(app.initializeApp(firebaseConfig), {
      config: { send_page_view: false, page_location: `${window.location.origin}/` },
    });
    return { analytics, sdk };
  });
  return ready;
}

function report(err: unknown): void {
  console.error('analytics', err);
}

export function startAnalytics(): void {
  if (analyticsBuiltIn && !analyticsOptedOut()) void init().catch(report);
}

export function setAnalyticsOptOut(off: boolean): void {
  if (off) window.localStorage.setItem(OPT_OUT_KEY, 'true');
  else window.localStorage.removeItem(OPT_OUT_KEY);
  if (!analyticsBuiltIn || (off && ready === null)) return;
  void init()
    .then(({ analytics, sdk }) => sdk.setAnalyticsCollectionEnabled(analytics, !off))
    .catch(report);
}

function track(send: (analytics: Analytics, sdk: typeof import('firebase/analytics')) => void): void {
  if (!analyticsBuiltIn || analyticsOptedOut()) return;
  void init()
    .then(({ analytics, sdk }) => send(analytics, sdk))
    .catch(report);
}

/** A page_view whose path is the screen name, so project ids in real URLs never reach Analytics. */
export function logScreen(screenName: string): void {
  track((analytics, sdk) =>
    sdk.logEvent(analytics, 'page_view', {
      page_title: screenName,
      page_location: `${window.location.origin}/${screenName}`,
    }),
  );
}

export function useScreenView(screenName: string): void {
  const { pathname } = useLocation();
  useEffect(() => logScreen(screenName), [screenName, pathname]);
}

export function logEvent<K extends keyof AnalyticsEvents>(name: K, params: AnalyticsEvents[K]): void {
  track((analytics, sdk) => sdk.logEvent(analytics, name as string, params));
}
