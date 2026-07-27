/**
 * Theme selection.
 *
 * Change `ACTIVE_THEME` and nothing else — every colour, font, and texture in
 * the app resolves from the custom properties defined for that theme in
 * `themes.css`. Structural CSS never names a colour directly.
 *
 * A user-facing switcher is the obvious next step; this constant is what it
 * will set.
 *
 * Deliberately untouched by any theme: the wall's own background colour and
 * each poster's frame and artwork. Those are the user's data, not chrome, and
 * they must look the same whichever theme is on.
 */
export type ThemeName = 'metal' | 'minimal';

export const ACTIVE_THEME: ThemeName = 'metal';

export const THEMES: Record<ThemeName, { label: string; description: string }> = {
  metal: {
    label: 'Metal',
    description: 'Near-black, bone white, blood red. Condensed caps and grain.',
  },
  minimal: {
    label: 'Minimal',
    description: 'Black, white, and red. Nothing else.',
  },
};

/** Applied to <html> so CSS can select on it. */
export function applyTheme(theme: ThemeName = ACTIVE_THEME): void {
  document.documentElement.dataset.theme = theme;
}
