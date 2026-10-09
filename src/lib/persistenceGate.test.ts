import { describe, it, expect } from 'vitest'
import { documentView, canSave, saveBlockedReason, saveFailure, shouldSeedFirstSlide, type GateState } from './persistenceGate'

/**
 * Why this exists.
 *
 * collab-common 0.7.1 refuses to save until the presentation has loaded, and
 * reports a load that failed (including a relay that connects but never
 * answers) as loadStatus 'failed' instead of pretending it found a new, empty
 * presentation. Before that, a slow or silent relay looked like "no
 * presentation", and slides also seeded a blank first slide after an 8 second
 * backstop, so the next save replaced the real deck with a blank one.
 */

function state(over: Partial<GateState> = {}): GateState {
  return { loadStatus: 'idle', loadError: null, saving: false, error: null, ...over }
}

describe('documentView', () => {
  it('shows loading until the load settles', () => {
    expect(documentView(state({ loadStatus: 'idle' }))).toBe('loading')
    expect(documentView(state({ loadStatus: 'loading' }))).toBe('loading')
  })

  it('shows the editor only once loaded', () => {
    expect(documentView(state({ loadStatus: 'loaded' }))).toBe('ready')
  })

  it('shows an error, never a blank editor, when the load failed', () => {
    expect(documentView(state({ loadStatus: 'failed', loadError: new Error('timed out') }))).toBe('failed')
  })
})

describe('save gate', () => {
  it('refuses to save before the presentation has loaded', () => {
    for (const loadStatus of ['idle', 'loading'] as const) {
      expect(canSave(state({ loadStatus }))).toBe(false)
      expect(saveBlockedReason(state({ loadStatus }))).toMatch(/still loading/i)
    }
  })

  it('refuses to save a presentation that failed to load', () => {
    const s = state({ loadStatus: 'failed', loadError: new Error('timed out') })
    expect(canSave(s)).toBe(false)
    expect(saveBlockedReason(s)).toMatch(/could not be opened/i)
  })

  it('refuses a second save while one is in flight', () => {
    const s = state({ loadStatus: 'loaded', saving: true })
    expect(canSave(s)).toBe(false)
    expect(saveBlockedReason(s)).toMatch(/already saving/i)
  })

  it('allows a save once loaded', () => {
    const s = state({ loadStatus: 'loaded' })
    expect(canSave(s)).toBe(true)
    expect(saveBlockedReason(s)).toBeNull()
  })
})

describe('saveFailure', () => {
  it('reports a save error once the presentation is loaded', () => {
    const err = new Error('blossom down')
    expect(saveFailure(state({ loadStatus: 'loaded', error: err }))).toBe(err)
  })

  it('does not report a load failure as a save failure', () => {
    const err = new Error('timed out')
    expect(saveFailure(state({ loadStatus: 'failed', loadError: err, error: err }))).toBeNull()
  })
})

describe('shouldSeedFirstSlide', () => {
  it('seeds a first slide into an empty presentation once it has loaded', () => {
    expect(shouldSeedFirstSlide(state({ loadStatus: 'loaded' }), 0)).toBe(true)
  })

  it('never seeds while loading: a blank slide would merge into the real deck', () => {
    expect(shouldSeedFirstSlide(state({ loadStatus: 'loading' }), 0)).toBe(false)
    expect(shouldSeedFirstSlide(state({ loadStatus: 'idle' }), 0)).toBe(false)
  })

  it('never seeds after a failed load', () => {
    expect(shouldSeedFirstSlide(state({ loadStatus: 'failed' }), 0)).toBe(false)
  })

  it('never seeds into a presentation that already has slides', () => {
    expect(shouldSeedFirstSlide(state({ loadStatus: 'loaded' }), 3)).toBe(false)
  })
})
