/**
 * What the editor shows, whether a save may be attempted, and when a first
 * slide may be seeded, decided from the persistence hook's state in ONE place.
 * Every save path (status-bar button, File menu, Ctrl+S) goes through
 * `saveBlockedReason`.
 *
 * collab-common 0.7.1 already refuses a save before load; this exists so the
 * app never offers one, never seeds a blank slide into a deck it has not
 * loaded, and shows a presentation that failed to open as an error rather than
 * as a blank editor somebody could edit and save.
 */

/** The fields of useDocumentPersistence's state this module reads. */
export interface GateState {
  loadStatus: 'idle' | 'loading' | 'loaded' | 'failed'
  loadError: Error | null
  saving: boolean
  /** Holds load failures too (collab-common copies them), see saveFailure. */
  error: Error | null
}

export type DocumentView = 'loading' | 'ready' | 'failed'

export function documentView(s: GateState): DocumentView {
  if (s.loadStatus === 'loaded') return 'ready'
  if (s.loadStatus === 'failed') return 'failed'
  return 'loading'
}

/** Why a save cannot run right now, or null when it can. */
export function saveBlockedReason(s: GateState): string | null {
  switch (s.loadStatus) {
    case 'idle':
    case 'loading':
      return 'The presentation is still loading, so nothing was saved yet.'
    case 'failed':
      return 'This presentation could not be opened, so it cannot be saved. Retry loading it first.'
  }
  if (s.saving) return 'Already saving.'
  return null
}

export function canSave(s: GateState): boolean {
  return saveBlockedReason(s) === null
}

/**
 * A save error worth showing as "could not save". Only meaningful once the
 * presentation has loaded: before that, `error` may be the load failure, which
 * the load-failed view already shows.
 */
export function saveFailure(s: GateState): Error | null {
  return s.loadStatus === 'loaded' ? s.error : null
}

/**
 * A brand-new presentation gets one blank slide so the toolbar has something
 * to act on. Only after a confirmed load: seeding earlier merges a stray blank
 * slide into a real deck, and seeding after a failed load creates content the
 * user never had.
 */
export function shouldSeedFirstSlide(s: GateState, slideCount: number): boolean {
  return s.loadStatus === 'loaded' && slideCount === 0
}
