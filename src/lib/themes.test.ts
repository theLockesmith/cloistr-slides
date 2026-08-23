import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES, DEFAULT_THEME, resolveTheme, themeBackground } from './themes'

describe('resolveTheme', () => {
  it('returns DEFAULT_THEME for undefined', () => {
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME)
  })

  it('returns DEFAULT_THEME for unknown id', () => {
    expect(resolveTheme('does-not-exist')).toBe(DEFAULT_THEME)
  })

  it('returns DEFAULT_THEME for empty string', () => {
    expect(resolveTheme('')).toBe(DEFAULT_THEME)
  })

  it('resolves each built-in theme by id', () => {
    for (const theme of BUILT_IN_THEMES) {
      const resolved = resolveTheme(theme.id)
      expect(resolved).toBe(theme)
      expect(resolved.id).toBe(theme.id)
    }
  })

  it('resolves the dark theme', () => {
    const dark = resolveTheme('dark')
    expect(dark.name).toBe('Dark')
    expect(dark.background.value).toBe('#1a1a2e')
  })

  it('resolves the ocean theme', () => {
    const ocean = resolveTheme('ocean')
    expect(ocean.textColor).toBe('#ffffff')
  })
})

describe('themeBackground', () => {
  it('returns the theme background when no override', () => {
    const bg = themeBackground(DEFAULT_THEME)
    expect(bg).toEqual(DEFAULT_THEME.background)
    // Must be a copy, not the same object reference.
    expect(bg).not.toBe(DEFAULT_THEME.background)
  })

  it('returns a color background for an override string', () => {
    const bg = themeBackground(DEFAULT_THEME, '#ff0000')
    expect(bg).toEqual({ type: 'color', value: '#ff0000' })
  })

  it('ignores the theme background when an override is provided', () => {
    const dark = resolveTheme('dark')
    const bg = themeBackground(dark, '#ffffff')
    expect(bg.value).toBe('#ffffff')
  })
})

describe('BUILT_IN_THEMES', () => {
  it('has at least 5 themes', () => {
    expect(BUILT_IN_THEMES.length).toBeGreaterThanOrEqual(5)
  })

  it('every theme has required fields', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(typeof theme.id).toBe('string')
      expect(typeof theme.name).toBe('string')
      expect(typeof theme.textColor).toBe('string')
      expect(typeof theme.accentColor).toBe('string')
      expect(typeof theme.fontFamily).toBe('string')
      expect(['color', 'gradient', 'image']).toContain(theme.background.type)
    }
  })

  it('ids are unique', () => {
    const ids = BUILT_IN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the first theme is the default', () => {
    expect(BUILT_IN_THEMES[0]).toBe(DEFAULT_THEME)
    expect(DEFAULT_THEME.id).toBe('default')
  })
})
