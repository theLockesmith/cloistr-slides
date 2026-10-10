// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * Why this exists.
 *
 * SlideEditor renders the slide editor only after the presentation has
 * LOADED (`view !== 'ready'` renders a loading or failed panel instead).
 * Anything added to an unloaded deck merges into it, and a failed load must
 * read as an error, never as an empty presentation that can be saved over the
 * real one. Review found that removing that guard left every test passing:
 * nothing rendered the component. This does.
 *
 * The 'loaded' case proves the editor body does render when it should, so the
 * negative assertions in the other cases mean something.
 */

const h = vi.hoisted(() => {
  // A stub that absorbs any property access, call or construction.
  const deepStub = (): any =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : deepStub()),
      apply: () => deepStub(),
      construct: () => deepStub(),
    })
  return {
    deepStub,
    persistence: { state: {} as Record<string, unknown> },
    controls: {
      save: vi.fn(), load: vi.fn(() => Promise.resolve({ found: false })),
      exists: vi.fn(), enableAutoSave: vi.fn(), disableAutoSave: vi.fn(),
    },
  }
})

vi.mock('@cloistr/collab-common', () => ({
  useDocumentPersistence: () => [h.persistence.state, h.controls],
  NostrSyncProvider: class { constructor() { return h.deepStub() } },
}))
vi.mock('@cloistr/collab-common/storage', () => ({
  BlobStore: class { constructor() { return h.deepStub() } },
}))
vi.mock('@cloistr/ui/components', () => ({
  AppShell: ({ children }: { children: unknown }) => children,
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))
vi.mock('@cloistr/ui', () => ({ withSignerRetry: (fn: () => unknown) => fn() }))
vi.mock('jspdf', () => ({ default: class {} }))
vi.mock('../lib/pptx', () => ({ exportPptx: vi.fn() }))

import { SlideEditor } from './SlideEditor'

beforeAll(() => {
  // jsdom has no ResizeObserver; the editor observes its canvas once mounted.
  ;(globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} }
  // jsdom has no canvas; the draw effect already tolerates a null context.
  HTMLCanvasElement.prototype.getContext = (() => null) as any
})
afterEach(() => cleanup())

function stateWith(loadStatus: 'loading' | 'loaded' | 'failed', loadError: Error | null = null) {
  return {
    initialized: true, loading: loadStatus === 'loading', loadStatus, loadError,
    saving: false, dirty: false, lastSave: null, error: loadError,
  }
}

function renderEditor() {
  return render(<SlideEditor documentId="slides-render-test" signer={h.deepStub()} publicKey="pk-test" relayUrl="wss://relay.test" />)
}

const saveButton = () => screen.getByRole('button', { name: 'Save presentation' }) as HTMLButtonElement

describe('SlideEditor before the presentation has loaded', () => {
  it('does not render the editor, shows loading, and disables Save', () => {
    h.persistence.state = stateWith('loading')
    const { container } = renderEditor()
    expect(container.querySelector('.slides-body')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Slide' })).toBeNull()
    expect(screen.getByText('Loading presentation…')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('on a failed load shows the error, never the editor, and disables Save', () => {
    h.persistence.state = stateWith('failed', new Error('Relay query timed out'))
    const { container } = renderEditor()
    expect(container.querySelector('.slides-body')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/could not be opened/i)
    expect(saveButton().disabled).toBe(true)
  })
})

describe('SlideEditor once the presentation has loaded', () => {
  it('renders the editor (proves the negative assertions can fail)', () => {
    h.persistence.state = stateWith('loaded')
    const { container } = renderEditor()
    expect(container.querySelector('.slides-body')).not.toBeNull()
    expect(screen.getByRole('button', { name: '+ Slide' })).toBeTruthy()
    expect(screen.queryByText('Loading presentation…')).toBeNull()
  })
})
