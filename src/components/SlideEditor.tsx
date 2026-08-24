import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import jsPDF from 'jspdf'
import { NostrSyncProvider, useDocumentPersistence } from '@cloistr/collab-common'
import { BlobStore } from '@cloistr/collab-common/storage'
import { AppShell, useToast } from '@cloistr/ui/components'
import type { MenuSection } from '@cloistr/ui/components'
import { withSignerRetry } from '@cloistr/ui'
import type { SignerInterface } from '@cloistr/auth'
import type { AnySlideElement, Presentation, PresentationMetadata, ShapeElement, Slide, TextElement } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'
import { drawSlide, handleAt, hitTest, resizeRect, type HandleId } from '../lib/render'
import { createImageElement, createShapeElement, createTextElement, measureImage } from '../lib/elements'
import * as doc from '../lib/ydoc'
import { exportPptx } from '../lib/pptx'
import { PropertiesPanel } from './PropertiesPanel'
import { PresentMode } from './PresentMode'

// For development, use VITE_BLOSSOM_URL env var or fall back to public server
// Production uses files.cloistr.xyz with platform auth
const BLOSSOM_URL = import.meta.env.VITE_BLOSSOM_URL || 'https://nostr.download'

const SHAPES: Array<{ shape: ShapeElement['shape']; label: string }> = [
  { shape: 'rectangle', label: 'Rectangle' },
  { shape: 'circle', label: 'Ellipse' },
  { shape: 'triangle', label: 'Triangle' },
  { shape: 'line', label: 'Line' },
]

interface SlideEditorProps {
  documentId: string
  onPresentationChange?: (presentation: Presentation) => void
  signer: SignerInterface
  publicKey: string
  relayUrl: string
}

interface DragState {
  mode: 'move' | 'resize'
  handle: HandleId | null
  elementId: string
  startX: number
  startY: number
  origin: { x: number; y: number; width: number; height: number }
}

export const SlideEditor: React.FC<SlideEditorProps> = ({
  documentId,
  onPresentationChange,
  signer,
  publicKey,
  relayUrl,
}) => {
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const seededRef = useRef(false)

  const [ydoc] = useState(() => new Y.Doc())
  const [, setProvider] = useState<NostrSyncProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

  const [presentation, setPresentation] = useState<Presentation>(() => doc.readSnapshot(ydoc))
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [scale, setScale] = useState(1)
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Loaded images, plus a tick so a decode that finishes after the draw still
  // repaints — without it an image stayed a grey placeholder until some other
  // edit happened to trigger a render.
  const imagesRef = useRef(new Map<string, HTMLImageElement>())
  const [imageTick, setImageTick] = useState(0)

  const slides = presentation.slides
  const currentIndex = Math.max(0, slides.findIndex((slide) => slide.id === currentSlideId))
  const currentSlide: Slide | undefined = slides[currentIndex]
  const selectedElement: AnySlideElement | null =
    currentSlide?.elements.find((element) => element.id === selectedId) ?? null

  /** Mirror every Yjs change — local, remote, or a loaded snapshot — into React. */
  useEffect(() => {
    const sync = () => setPresentation(doc.readSnapshot(ydoc))
    ydoc.on('update', sync)
    sync()
    return () => {
      ydoc.off('update', sync)
    }
  }, [ydoc])

  useEffect(() => {
    onPresentationChange?.(presentation)
  }, [presentation, onPresentationChange])

  useEffect(() => {
    doc.initMetadata(ydoc, { author: publicKey })
  }, [ydoc, publicKey])

  // Relay sync
  useEffect(() => {
    const syncProvider = new NostrSyncProvider(ydoc, { signer, relayUrl, docId: documentId })

    syncProvider.onConnect = () => setIsConnected(true)
    syncProvider.onDisconnect = () => setIsConnected(false)
    syncProvider.onPeersChange = (count: number) => setPeerCount(count)
    syncProvider.onError = (error: Error) => console.error('[SlideEditor] Sync error:', error)

    syncProvider.connect().catch((error) => console.error('[SlideEditor] Connect failed:', error))
    setProvider(syncProvider)

    return () => {
      syncProvider.destroy()
    }
  }, [documentId, ydoc, signer, relayUrl])

  const [persistenceState, persistenceControls] = useDocumentPersistence(
    ydoc,
    { documentId, blossomUrl: BLOSSOM_URL, relayUrl, signer, documentType: 'slides' },
    { autoLoad: true, autoSaveInterval: 60000 }
  )

  // Seed a first slide once loading has settled — seeding on mount would race
  // the snapshot load and merge a stray blank slide into a real deck.
  //
  // BUT `loading` cannot be the only gate. useDocumentPersistence leaves it set
  // when the initial autoLoad finds no snapshot, which is exactly the case for
  // a brand-new user — so gating solely on it meant a first-time user got NO
  // slide, and with no current slide every toolbar button is disabled. An empty
  // editor you cannot add anything to.
  //
  // So: seed as soon as loading clears, or after a bounded wait regardless. The
  // wait only risks a duplicate blank slide in the rare case where a real load
  // takes longer than it, which is far better than an unusable editor.
  useEffect(() => {
    if (seededRef.current) return

    const seed = () => {
      if (seededRef.current) return
      seededRef.current = true
      if (doc.slideIds(ydoc).length === 0) doc.createSlide(ydoc)
    }

    if (!persistenceState.loading) {
      seed()
      return
    }

    const backstop = setTimeout(seed, 8000)
    return () => clearTimeout(backstop)
  }, [persistenceState.loading, ydoc])

  useEffect(() => {
    if (slides.length === 0) {
      if (currentSlideId !== null) setCurrentSlideId(null)
      return
    }
    if (!slides.some((slide) => slide.id === currentSlideId)) setCurrentSlideId(slides[0]!.id)
  }, [slides, currentSlideId])

  useEffect(() => {
    if (persistenceState.error) {
      toast.error(`Could not save: ${persistenceState.error.message}`, { duration: 8000 })
    }
  }, [persistenceState.error, toast])

  // Track the canvas's on-screen size so selection handles and the text overlay
  // stay a constant size regardless of zoom or viewport.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setScale(SLIDE_WIDTH / width)
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Fetch any image src we have not loaded yet.
  useEffect(() => {
    const sources = new Set<string>()
    for (const slide of slides) {
      for (const element of slide.elements) {
        if (element.type === 'image' && element.src) sources.add(element.src)
      }
      if (slide.background?.type === 'image' && slide.background.value) {
        sources.add(slide.background.value)
      }
    }

    for (const src of sources) {
      if (imagesRef.current.has(src)) continue
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => setImageTick((tick) => tick + 1)
      img.onerror = () => setImageTick((tick) => tick + 1)
      img.src = src
      imagesRef.current.set(src, img)
    }
  }, [slides])

  // Draw
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawSlide(ctx, currentSlide, {
      images: imagesRef.current,
      selectedId: editingId ? null : selectedId,
      scale,
    })
  }, [currentSlide, selectedId, editingId, scale, imageTick])

  const toLogical = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (SLIDE_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (SLIDE_HEIGHT / rect.height),
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentSlide) return
    const { x, y } = toLogical(event)

    const handle = handleAt(selectedElement, x, y, scale)
    const target = handle ? selectedElement : hitTest(currentSlide, x, y)

    setEditingId(null)
    setSelectedId(target?.id ?? null)

    if (!target) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode: handle ? 'resize' : 'move',
      handle,
      elementId: target.id,
      startX: x,
      startY: y,
      origin: { x: target.x, y: target.y, width: target.width, height: target.height },
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || !currentSlide) return

    const { x, y } = toLogical(event)
    const dx = x - drag.startX
    const dy = y - drag.startY

    if (drag.mode === 'move') {
      doc.updateElement(ydoc, currentSlide.id, drag.elementId, {
        x: Math.round(drag.origin.x + dx),
        y: Math.round(drag.origin.y + dy),
      })
      return
    }

    const element = currentSlide.elements.find((el) => el.id === drag.elementId)
    if (!element || !drag.handle) return

    const next = resizeRect({ ...element, ...drag.origin }, drag.handle, dx, dy)
    doc.updateElement(ydoc, currentSlide.id, drag.elementId, {
      x: Math.round(next.x),
      y: Math.round(next.y),
      width: Math.round(next.width),
      height: Math.round(next.height),
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentSlide) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (SLIDE_WIDTH / rect.width)
    const y = (event.clientY - rect.top) * (SLIDE_HEIGHT / rect.height)

    const target = hitTest(currentSlide, x, y)
    if (target?.type === 'text') {
      setSelectedId(target.id)
      setEditingId(target.id)
    }
  }

  // Delete the selection, but never while a text box or form field has focus —
  // Backspace has to keep deleting characters there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedId || !currentSlide || editingId) return

      const active = document.activeElement
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return

      event.preventDefault()
      doc.deleteElement(ydoc, currentSlide.id, selectedId)
      setSelectedId(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, currentSlide, editingId, ydoc])

  const addElement = useCallback(
    (element: AnySlideElement) => {
      if (!currentSlide) return
      doc.addElement(ydoc, currentSlide.id, element)
      setSelectedId(element.id)
    },
    [currentSlide, ydoc]
  )

  const onAddText = () => addElement(createTextElement(doc.nextZIndex(currentSlide)))

  const onAddShape = (shape: ShapeElement['shape']) => {
    setShapeMenuOpen(false)
    addElement(createShapeElement(shape, doc.nextZIndex(currentSlide)))
  }

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !currentSlide) return

    setUploading(true)
    try {
      const [{ width, height }, buffer] = await Promise.all([measureImage(file), file.arrayBuffer()])
      const store = new BlobStore({ blossomUrl: BLOSSOM_URL })
      // Part 2: retry the signing step if it fails for a retryable reason
      // (relay unreachable, socket closed). A user denial or malformed request
      // rethrows immediately so it is not retried.
      const metadata = await withSignerRetry(() =>
        store.upload(new Uint8Array(buffer), file.type, signer as any)
      )
      const src = metadata.url || `${BLOSSOM_URL.replace(/\/$/, '')}/${metadata.hash}`

      addElement(createImageElement(src, width, height, doc.nextZIndex(currentSlide)))
      toast.success('Image added')
    } catch (error) {
      // Upload failures used to vanish into console.error, so a missing image
      // looked like the button doing nothing at all.
      toast.error(`Image upload failed: ${(error as Error).message}`, { duration: 8000 })
    } finally {
      setUploading(false)
    }
  }

  const onSave = async () => {
    try {
      await persistenceControls.save()
      toast.success('Presentation saved')
    } catch (error) {
      toast.error(`Could not save: ${(error as Error).message}`, { duration: 8000 })
    }
  }

  /**
   * Export every slide to a PDF with one slide per page.
   *
   * Each slide is drawn to an off-screen canvas at the native 1600×900
   * resolution and added as a full-page PNG image so the vector structure of
   * the PDF matches the on-screen canvas exactly. jsPDF handles the pixel-to-
   * point conversion internally.
   */
  const onExportPdf = async () => {
    if (slides.length === 0) return
    setExporting(true)
    try {
      const offscreen = document.createElement('canvas')
      offscreen.width = SLIDE_WIDTH
      offscreen.height = SLIDE_HEIGHT
      const ctx = offscreen.getContext('2d')
      if (!ctx) throw new Error('Could not get 2D context for export')

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [SLIDE_WIDTH, SLIDE_HEIGHT],
        hotfixes: ['px_scaling'],
      })

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
        drawSlide(ctx, slides[i], { images: imagesRef.current, scale: 1, presenting: true })
        pdf.addImage(offscreen, 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
      }

      const title = presentation.metadata.title || 'presentation'
      const filename = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`
      pdf.save(filename)
      toast.success('PDF exported')
    } catch (error) {
      toast.error(`Export failed: ${(error as Error).message}`, { duration: 8000 })
    } finally {
      setExporting(false)
    }
  }

  const onExportPptx = async () => {
    if (slides.length === 0) return
    setExporting(true)
    try {
      await exportPptx(presentation, imagesRef.current)
      toast.success('PPTX exported')
    } catch (error) {
      toast.error(`PPTX export failed: ${(error as Error).message}`, { duration: 8000 })
    } finally {
      setExporting(false)
    }
  }

  const editingElement = editingId
    ? (currentSlide?.elements.find((el) => el.id === editingId) as TextElement | undefined)
    : undefined

  const saveLabel = persistenceState.saving
    ? 'Saving…'
    : persistenceState.dirty
      ? 'Save'
      : persistenceState.lastSave
        ? 'Saved'
        : 'Save'

  // ── Menu bar actions ──────────────────────────────────────────────────────

  /**
   * Build the AppShell menu sections. AppShell takes DATA (MenuSection[]),
   * not JSX — one definition renders as a horizontal bar on desktop and as
   * collapsible drawer sections on mobile from a single source.
   *
   * An item with no `onSelect` renders DISABLED; never an enabled no-op.
   * Format > Theme… was confirmed enabled-but-inert (opens Properties panel,
   * no theme section there) — mapped to disabled with a reason here.
   *
   * "COMING SOON" items: File > New, File > Import, File > Print,
   * Edit > Undo, Edit > Redo, View > Grid View, Insert > Table,
   * Arrange > Send to Back, Arrange > Align, Arrange > Group.
   */
  const menuSections = useMemo((): MenuSection[] => {
    const hasSlides = slides.length > 0
    const hasCurrentSlide = currentSlide !== undefined
    const hasSelection = selectedId !== null && currentSlide !== undefined
    const canDeleteSlide = hasCurrentSlide && slides.length > 1

    return [
      // ── File ──────────────────────────────────────────────────────────────
      {
        label: 'File',
        items: [
          { label: 'New presentation', disabledReason: 'Multi-document support coming soon' },
          { label: 'Import…', disabledReason: 'Import coming soon' },
          { separator: true },
          {
            label: 'Save',
            shortcut: 'Ctrl+S',
            onSelect: persistenceState.initialized && !persistenceState.saving ? onSave : undefined,
            disabledReason: !persistenceState.initialized || persistenceState.saving
              ? (persistenceState.saving ? 'Save in progress' : 'Not ready yet')
              : undefined,
          },
          { separator: true },
          {
            label: 'Export PPTX',
            shortcut: 'Ctrl+Shift+X',
            onSelect: hasSlides && !exporting ? onExportPptx : undefined,
            disabledReason: !hasSlides || exporting
              ? (exporting ? 'Export in progress' : 'No slides to export')
              : undefined,
          },
          {
            label: 'Download PDF',
            shortcut: 'Ctrl+Shift+D',
            onSelect: hasSlides && !exporting ? onExportPdf : undefined,
            disabledReason: !hasSlides || exporting
              ? (exporting ? 'Export in progress' : 'No slides to export')
              : undefined,
          },
          { label: 'Print', disabledReason: 'Print coming soon — use Download PDF for now' },
        ],
      },

      // ── Edit ──────────────────────────────────────────────────────────────
      {
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', disabledReason: 'Undo manager not yet configured — coming soon' },
          { label: 'Redo', shortcut: 'Ctrl+Y', disabledReason: 'Undo manager not yet configured — coming soon' },
          { separator: true },
          {
            label: 'Duplicate slide',
            shortcut: 'Ctrl+D',
            onSelect: hasCurrentSlide ? () => {
              if (currentSlide) {
                const id = doc.duplicateSlide(ydoc, currentSlide.id)
                if (id) setCurrentSlideId(id)
              }
            } : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Delete slide',
            onSelect: canDeleteSlide ? () => {
              if (currentSlide) doc.deleteSlide(ydoc, currentSlide.id)
            } : undefined,
            disabledReason: !canDeleteSlide
              ? (!hasCurrentSlide ? 'No current slide' : 'Cannot delete the last slide')
              : undefined,
          },
        ],
      },

      // ── View ──────────────────────────────────────────────────────────────
      {
        label: 'View',
        items: [
          {
            label: 'Present',
            shortcut: 'F5',
            onSelect: hasSlides ? () => setPresenting(true) : undefined,
            disabledReason: hasSlides ? undefined : 'No slides to present',
          },
          { label: 'Grid view', disabledReason: 'Grid view coming soon' },
          { separator: true },
          {
            label: 'Speaker notes',
            onSelect: hasCurrentSlide ? () => setPanelOpen(true) : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Properties panel',
            onSelect: () => setPanelOpen((o) => !o),
          },
        ],
      },

      // ── Insert ────────────────────────────────────────────────────────────
      {
        label: 'Insert',
        items: [
          {
            label: 'New slide',
            shortcut: 'Ctrl+M',
            onSelect: () => setCurrentSlideId(doc.createSlide(ydoc)),
          },
          { separator: true },
          {
            label: 'Text box',
            shortcut: 'T',
            onSelect: hasCurrentSlide ? onAddText : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Image…',
            shortcut: 'I',
            onSelect: hasCurrentSlide && !uploading ? () => fileInputRef.current?.click() : undefined,
            disabledReason: !hasCurrentSlide || uploading
              ? (uploading ? 'Upload in progress' : 'No current slide')
              : undefined,
          },
          { separator: true },
          {
            label: 'Shape: Rectangle',
            onSelect: hasCurrentSlide ? () => onAddShape('rectangle') : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Shape: Ellipse',
            onSelect: hasCurrentSlide ? () => onAddShape('circle') : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Shape: Triangle',
            onSelect: hasCurrentSlide ? () => onAddShape('triangle') : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Shape: Line',
            onSelect: hasCurrentSlide ? () => onAddShape('line') : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          { separator: true },
          { label: 'Table', disabledReason: 'Table insertion coming soon' },
        ],
      },

      // ── Format ────────────────────────────────────────────────────────────
      {
        label: 'Format',
        items: [
          // DISABLED: confirmed production bug 2026-08-24 where this was enabled
          // but clicking it opened the Properties panel, which has no theme
          // section — enabled-but-inert is the exact pattern the model forbids.
          { label: 'Theme…', disabledReason: 'Theme editor coming soon' },
          {
            label: 'Background…',
            onSelect: hasCurrentSlide ? () => setPanelOpen(true) : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
          {
            label: 'Transition…',
            onSelect: hasCurrentSlide ? () => setPanelOpen(true) : undefined,
            disabledReason: hasCurrentSlide ? undefined : 'No current slide',
          },
        ],
      },

      // ── Arrange ───────────────────────────────────────────────────────────
      {
        label: 'Arrange',
        items: [
          {
            label: 'Bring to front',
            shortcut: 'Ctrl+]',
            onSelect: hasSelection ? () => {
              if (currentSlide && selectedId) {
                doc.bringToFront(ydoc, currentSlide.id, selectedId)
              }
            } : undefined,
            disabledReason: hasSelection ? undefined : 'Select an element first',
          },
          { label: 'Send to back', disabledReason: 'Send to back coming soon' },
          { separator: true },
          { label: 'Align…', disabledReason: 'Alignment tools coming soon' },
          { label: 'Group', disabledReason: 'Grouping coming soon' },
        ],
      },
    // exactOptionalPropertyTypes: the conditional `onSelect: fn | undefined` pattern
    // produces a union type that is structurally incompatible with MenuItem's
    // `onSelect?: () => void` under exactOptionalPropertyTypes. The spread pattern
    // would require rewriting every item; the cast here is correct because undefined
    // is stripped at render time by isSeparator() / menuItemState() in AppShell.
    ] as unknown as MenuSection[]
  }, [
    slides,
    currentSlide,
    selectedId,
    exporting,
    uploading,
    persistenceState.initialized,
    persistenceState.saving,
    ydoc,
    onAddText,
    onAddShape,
    onSave,
    onExportPdf,
    onExportPptx,
  ])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  /**
   * Global shortcut handler for menu-bar commands.
   *
   * Guard rules (applied to all shortcuts below unless noted):
   *   Single-character shortcuts (T, I, F5): skip when editingId is set or
   *   an input/textarea/select has focus — those keys are typing.
   *   Ctrl+ combos: always fire (Ctrl+S saving while typing is expected).
   *
   * Each shortcut here must match the `shortcut` string in the menus array
   * above so the menu label and the actual behaviour stay in sync.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inText =
        editingId !== null ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement as HTMLElement | null)?.tagName ?? '',
        )

      // F5 — present (single key, but not a letter, so skip the letter guard)
      if (e.key === 'F5' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (slides.length > 0) setPresenting(true)
        return
      }

      // Letter shortcuts — skip when typing
      if (!inText && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault()
          if (currentSlide) onAddText()
          return
        }
        if (e.key === 'i' || e.key === 'I') {
          e.preventDefault()
          if (currentSlide && !uploading) fileInputRef.current?.click()
          return
        }
      }

      // Ctrl / Cmd combos
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Ctrl+S — save
      if (e.key === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        onSave()
        return
      }

      // Ctrl+Shift+X — export PPTX
      if ((e.key === 'x' || e.key === 'X') && e.shiftKey) {
        e.preventDefault()
        if (slides.length > 0 && !exporting) onExportPptx()
        return
      }

      // Ctrl+Shift+D — download PDF
      if ((e.key === 'd' || e.key === 'D') && e.shiftKey) {
        e.preventDefault()
        if (slides.length > 0 && !exporting) onExportPdf()
        return
      }

      // Ctrl+D — duplicate slide
      if ((e.key === 'd' || e.key === 'D') && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (currentSlide) {
          const id = doc.duplicateSlide(ydoc, currentSlide.id)
          if (id) setCurrentSlideId(id)
        }
        return
      }

      // Ctrl+M — new slide
      if ((e.key === 'm' || e.key === 'M') && !e.shiftKey) {
        e.preventDefault()
        setCurrentSlideId(doc.createSlide(ydoc))
        return
      }

      // Ctrl+] — bring to front
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        if (currentSlide && selectedId) doc.bringToFront(ydoc, currentSlide.id, selectedId)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    editingId,
    currentSlide,
    slides.length,
    selectedId,
    uploading,
    exporting,
    ydoc,
    onAddText,
    onSave,
    onExportPdf,
    onExportPptx,
  ])

  // ORDER MATTERS, and getting it wrong made the bar lie.
  //
  // `loading` was checked first, so the status read "Loading…" indefinitely —
  // measured in production: a save completed with PUT /upload -> 200 and the
  // bar still said "Loading…" ninety seconds later, because
  // useDocumentPersistence leaves `loading` set when the initial autoLoad finds
  // no snapshot to restore. The user saw a permanent spinner over a document
  // that had in fact saved.
  //
  // What just happened outranks what is still in flight: an in-progress save,
  // then an error, then a completed save, and only then the load state — and
  // even that is suppressed once anything has saved, since by then the initial
  // load is ancient history no matter what the flag says.
  const status = useMemo(() => {
    if (persistenceState.saving) return 'Saving…'
    if (persistenceState.error) return `Save failed — ${persistenceState.error.message}`
    if (persistenceState.lastSave) {
      return `Saved ${new Date(persistenceState.lastSave.timestamp).toLocaleTimeString()}`
    }
    if (persistenceState.loading) return 'Loading…'
    return persistenceState.dirty ? 'Unsaved changes' : 'No changes yet'
  }, [persistenceState])

  if (presenting && slides.length > 0) {
    return (
      <PresentMode
        slides={slides}
        index={currentIndex}
        images={imagesRef.current}
        onIndexChange={(index) => setCurrentSlideId(slides[index]?.id ?? null)}
        onExit={() => setPresenting(false)}
      />
    )
  }

  return (
    <AppShell serviceId="slides" menu={menuSections}>

      <div className="slides-body">
        {/* Slide thumbnails — a sidebar on desktop, a scrolling strip on mobile */}
        <aside className="slides-rail" aria-label="Slides">
          <div className="slides-rail-actions">
            <button type="button" onClick={() => setCurrentSlideId(doc.createSlide(ydoc))}>
              + Slide
            </button>
          </div>

          <ol className="slides-rail-list">
            {slides.map((slide, index) => (
              <li key={slide.id} className="slides-rail-item">
                <button
                  type="button"
                  className={`slides-thumb${slide.id === currentSlideId ? ' is-active' : ''}`}
                  aria-current={slide.id === currentSlideId}
                  onClick={() => {
                    setCurrentSlideId(slide.id)
                    setSelectedId(null)
                  }}
                >
                  <span className="slides-thumb-title">
                    {index + 1}. {slide.title}
                  </span>
                  <span className="slides-thumb-meta">
                    {slide.elements.length} element{slide.elements.length === 1 ? '' : 's'}
                  </span>
                </button>

                {/* Reorder and duplicate. moveSlide/duplicateSlide already
                    existed in the document layer with nothing calling them.
                    Buttons rather than drag-and-drop: they work with a keyboard
                    and on a touch screen, where a drag handle in a horizontal
                    scrolling filmstrip fights the scroll gesture. */}
                <div className="slides-thumb-actions">
                  <button
                    type="button"
                    aria-label={`Move ${slide.title} up`}
                    disabled={index === 0}
                    onClick={() => doc.moveSlide(ydoc, index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${slide.title} down`}
                    disabled={index === slides.length - 1}
                    onClick={() => doc.moveSlide(ydoc, index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${slide.title}`}
                    onClick={() => {
                      const id = doc.duplicateSlide(ydoc, slide.id)
                      if (id) setCurrentSlideId(id)
                    }}
                  >
                    ⧉
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <div className="slides-main">
          <div className="slides-toolbar">
            <button type="button" onClick={onAddText} disabled={!currentSlide}>
              Add text
            </button>

            <div className="slides-menu">
              <button
                type="button"
                aria-expanded={shapeMenuOpen}
                aria-haspopup="menu"
                disabled={!currentSlide}
                onClick={() => setShapeMenuOpen((open) => !open)}
              >
                Add shape ▾
              </button>
              {shapeMenuOpen && (
                <div className="slides-menu-list" role="menu">
                  {SHAPES.map(({ shape, label }) => (
                    <button key={shape} type="button" role="menuitem" onClick={() => onAddShape(shape)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!currentSlide || uploading}
            >
              {uploading ? 'Uploading…' : 'Add image'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onPickImage}
            />

            <button
              type="button"
              onClick={onExportPdf}
              disabled={slides.length === 0 || exporting}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>

            <button
              type="button"
              onClick={onExportPptx}
              disabled={slides.length === 0 || exporting}
            >
              Export PPTX
            </button>

            <button
              type="button"
              onClick={() => setPresenting(true)}
              disabled={slides.length === 0}
            >
              Present
            </button>

            <button
              type="button"
              className="slides-danger slides-toolbar-delete"
              disabled={!currentSlide || slides.length <= 1}
              onClick={() => {
                if (currentSlide) doc.deleteSlide(ydoc, currentSlide.id)
              }}
            >
              Delete slide
            </button>

            <div className="slides-toolbar-right">
              <label className="slides-zoom">
                <span>Zoom</span>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={zoom}
                  aria-label="Zoom"
                  onChange={(event) => setZoom(parseFloat(event.target.value))}
                />
                <span>{Math.round(zoom * 100)}%</span>
              </label>

              <button
                type="button"
                className="slides-panel-toggle"
                aria-expanded={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                {panelOpen ? 'Hide properties' : 'Properties'}
              </button>
            </div>
          </div>

          <div className="slides-canvas-scroll">
            <div className="slides-canvas-wrap" style={{ width: `${zoom * 100}%` }}>
              <canvas
                ref={canvasRef}
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                className="slides-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={onDoubleClick}
              />

              {editingElement && currentSlide && (
                <textarea
                  className="slides-text-overlay"
                  autoFocus
                  value={editingElement.content}
                  style={{
                    left: `${(editingElement.x / SLIDE_WIDTH) * 100}%`,
                    top: `${(editingElement.y / SLIDE_HEIGHT) * 100}%`,
                    width: `${(editingElement.width / SLIDE_WIDTH) * 100}%`,
                    height: `${(editingElement.height / SLIDE_HEIGHT) * 100}%`,
                    fontSize: `${editingElement.fontSize / scale}px`,
                    fontFamily: editingElement.fontFamily,
                    lineHeight: editingElement.lineHeight,
                    textAlign: editingElement.textAlign,
                    color: editingElement.color,
                  }}
                  onChange={(event) =>
                    doc.updateElement(ydoc, currentSlide.id, editingElement.id, {
                      content: event.target.value,
                    })
                  }
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <aside className={`slides-panel${panelOpen ? ' is-open' : ''}`} aria-label="Properties">
          <PropertiesPanel
            slide={currentSlide}
            element={selectedElement}
            metadata={presentation.metadata}
            onElementChange={(patch) => {
              if (currentSlide && selectedId) doc.updateElement(ydoc, currentSlide.id, selectedId, patch)
            }}
            onSlideChange={(patch) => {
              if (currentSlide) doc.updateSlide(ydoc, currentSlide.id, patch)
            }}
            onMetadataChange={(patch: Partial<PresentationMetadata>) => {
              doc.updateMetadata(ydoc, patch)
            }}
            onDeleteElement={() => {
              if (currentSlide && selectedId) {
                doc.deleteElement(ydoc, currentSlide.id, selectedId)
                setSelectedId(null)
              }
            }}
          />
        </aside>
      </div>

      <div className="slides-status">
        <span className="slides-status-doc" title={documentId}>
          {isConnected ? '🟢' : '🔴'} {peerCount + 1} online
        </span>
        <span>{status}</span>
        <button type="button" onClick={onSave} disabled={!persistenceState.initialized || persistenceState.saving}>
          {saveLabel}
        </button>
      </div>
    </AppShell>
  )
}
