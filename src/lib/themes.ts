/**
 * Built-in slide themes.
 *
 * A theme sets defaults for new slides (background, text colour, accent,
 * fonts). It does NOT retroactively recolour existing elements — applying a
 * theme only affects how new slides and elements are initialised.
 *
 * Themes are purely client-side metadata stored in presentation metadata.
 * They are resolved by id at runtime; missing ids fall back to DEFAULT_THEME.
 */
import type { SlideBackground, SlideTheme } from '../types/slide'

export const DEFAULT_THEME: SlideTheme = {
  id: 'default',
  name: 'Default',
  background: { type: 'color', value: '#ffffff' },
  textColor: '#111827',
  accentColor: '#3b82f6',
  fontFamily: 'Inter, system-ui, sans-serif',
}

export const BUILT_IN_THEMES: SlideTheme[] = [
  DEFAULT_THEME,
  {
    id: 'dark',
    name: 'Dark',
    background: { type: 'color', value: '#1a1a2e' },
    textColor: '#e0e0e0',
    accentColor: '#7c3aed',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: { type: 'color', value: '#0f4c75' },
    textColor: '#ffffff',
    accentColor: '#00b4d8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: { type: 'color', value: '#1b4332' },
    textColor: '#d8f3dc',
    accentColor: '#52b788',
    fontFamily: 'Georgia, serif',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background: { type: 'color', value: '#fff1e6' },
    textColor: '#370617',
    accentColor: '#f77f00',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    background: { type: 'color', value: '#f5f5f5' },
    textColor: '#1a1a1a',
    accentColor: '#555555',
    fontFamily: 'Menlo, monospace',
  },
]

/** Resolve a theme by id, falling back to the default. */
export function resolveTheme(themeId: string | undefined): SlideTheme {
  if (!themeId) return DEFAULT_THEME
  return BUILT_IN_THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEME
}

/**
 * Derive the background for a new slide given the active theme.
 * Allows the caller to override with a custom colour.
 */
export function themeBackground(theme: SlideTheme, override?: string): SlideBackground {
  if (override) return { type: 'color', value: override }
  return { ...theme.background }
}
