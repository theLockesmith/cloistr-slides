/**
 * Yjs document schema for presentations.
 *
 * The Yjs doc is the ONLY source of truth. React state is a snapshot derived
 * from it, never the other way round. Before this, the editor kept a parallel
 * React copy and pushed a subset into Yjs, which meant a loaded snapshot (or a
 * remote peer's edit) never reached the screen — you could save a deck and get
 * a blank one back.
 *
 * Layout:
 *   metadata   Y.Map                title / description / author
 *   slides     Y.Map<slideId, Y.Map>
 *                 elements  Y.Map<elementId, Y.Map>   z-order via each element's zIndex
 *                 background, title, notes
 *   slideOrder Y.Array<slideId>     slide order — a Y.Map alone has no order,
 *                                   so decks used to come back shuffled
 */
import * as Y from 'yjs'
import type {
  AnySlideElement,
  Presentation,
  PresentationMetadata,
  Slide,
  SlideBackground,
} from '../types/slide'

export type YSlide = Y.Map<any>
export type YElement = Y.Map<any>

const DEFAULT_BACKGROUND: SlideBackground = { type: 'color', value: '#ffffff' }

export const slidesMap = (doc: Y.Doc) => doc.getMap<YSlide>('slides')
export const orderArray = (doc: Y.Doc) => doc.getArray<string>('slideOrder')
export const metadataMap = (doc: Y.Doc) => doc.getMap<any>('metadata')

/**
 * Slide ids in presentation order.
 *
 * `slideOrder` is authoritative, but it is filtered against the slides map and
 * back-filled: a peer on an older build (or a snapshot written before
 * `slideOrder` existed) can leave slides that no entry points at, and those
 * must still be reachable rather than silently dropped.
 */
export function slideIds(doc: Y.Doc): string[] {
  const slides = slidesMap(doc)
  const ordered = orderArray(doc).toArray().filter((id) => slides.has(id))
  const seen = new Set(ordered)
  const orphans = Array.from(slides.keys()).filter((id) => !seen.has(id))
  return [...ordered, ...orphans]
}

/**
 * The elements container for a slide, migrating legacy shapes in place.
 *
 * Elements used to be a Y.Array of plain objects. Keying by id lets two people
 * edit different properties of the same element without one clobbering the
 * other, and makes an update a field write instead of a delete+insert (which
 * duplicates the element when it races a remote edit).
 */
export function ensureElements(yslide: YSlide): Y.Map<YElement> {
  const existing = yslide.get('elements')

  if (existing instanceof Y.Map) return existing as Y.Map<YElement>

  const migrated = new Y.Map<YElement>()
  if (existing instanceof Y.Array) {
    for (const raw of existing.toArray() as any[]) {
      const plain = raw instanceof Y.Map ? raw.toJSON() : raw
      if (plain?.id) migrated.set(plain.id, toYElement(plain))
    }
  }
  yslide.set('elements', migrated)
  return migrated
}

function toYElement(element: AnySlideElement | Record<string, any>): YElement {
  const ymap = new Y.Map<any>()
  for (const [key, value] of Object.entries(element)) ymap.set(key, value)
  return ymap
}

function readElements(yslide: YSlide): AnySlideElement[] {
  const raw = yslide.get('elements')
  let plain: any[] = []

  if (raw instanceof Y.Map) {
    plain = Array.from(raw.values()).map((el: any) => (el instanceof Y.Map ? el.toJSON() : el))
  } else if (raw instanceof Y.Array) {
    plain = (raw.toArray() as any[]).map((el) => (el instanceof Y.Map ? el.toJSON() : el))
  }

  return plain
    .filter((el) => el && typeof el.id === 'string')
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) as AnySlideElement[]
}

function readSlide(yslide: YSlide, index: number): Slide {
  return {
    id: yslide.get('id'),
    title: yslide.get('title') ?? `Slide ${index + 1}`,
    elements: readElements(yslide),
    background: yslide.get('background') ?? DEFAULT_BACKGROUND,
    notes: yslide.get('notes') ?? '',
    transition: yslide.get('transition') ?? 'none',
    createdAt: yslide.get('createdAt') ?? 0,
    updatedAt: yslide.get('updatedAt') ?? 0,
  }
}

export function readSnapshot(doc: Y.Doc): Presentation {
  const slides = slidesMap(doc)
  const meta = metadataMap(doc)

  const metadata: PresentationMetadata = {
    id: meta.get('id') ?? '',
    title: meta.get('title') ?? 'Untitled presentation',
    description: meta.get('description') ?? '',
    author: meta.get('author') ?? '',
    createdAt: meta.get('createdAt') ?? 0,
    updatedAt: meta.get('updatedAt') ?? 0,
    version: meta.get('version') ?? 1,
    tags: meta.get('tags') ?? [],
    themeId: meta.get('themeId') ?? undefined,
  }

  return {
    metadata,
    slides: slideIds(doc)
      .map((id, index) => {
        const yslide = slides.get(id)
        return yslide ? readSlide(yslide, index) : null
      })
      .filter((slide): slide is Slide => slide !== null),
    collaborators: meta.get('collaborators') ?? [],
  }
}

function touch(doc: Y.Doc, slideId?: string) {
  metadataMap(doc).set('updatedAt', Date.now())
  if (!slideId) return
  const yslide = slidesMap(doc).get(slideId)
  if (yslide) yslide.set('updatedAt', Date.now())
}

export function initMetadata(doc: Y.Doc, seed: Partial<PresentationMetadata>) {
  doc.transact(() => {
    const meta = metadataMap(doc)
    if (!meta.get('id')) meta.set('id', seed.id ?? crypto.randomUUID())
    if (!meta.get('title')) meta.set('title', seed.title ?? 'Untitled presentation')
    if (!meta.get('createdAt')) meta.set('createdAt', seed.createdAt ?? Date.now())
    if (!meta.get('version')) meta.set('version', 1)
    if (seed.author && !meta.get('author')) meta.set('author', seed.author)
  })
}

/**
 * Apply a partial patch to presentation metadata (title, themeId, etc.).
 * Only the fields included in `patch` are written; others are not touched.
 */
export function updateMetadata(doc: Y.Doc, patch: Partial<PresentationMetadata>) {
  doc.transact(() => {
    const meta = metadataMap(doc)
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) meta.set(key, value)
    }
    meta.set('updatedAt', Date.now())
  })
}

export function createSlide(doc: Y.Doc, atIndex?: number): string {
  const id = crypto.randomUUID()

  doc.transact(() => {
    const order = orderArray(doc)
    const yslide = new Y.Map<any>()
    yslide.set('id', id)
    yslide.set('title', `Slide ${order.length + 1}`)
    yslide.set('elements', new Y.Map<YElement>())
    yslide.set('background', { ...DEFAULT_BACKGROUND })
    yslide.set('notes', '')
    yslide.set('createdAt', Date.now())
    yslide.set('updatedAt', Date.now())

    slidesMap(doc).set(id, yslide)
    order.insert(Math.min(atIndex ?? order.length, order.length), [id])
    touch(doc)
  })

  return id
}

/**
 * Duplicate a slide, inserting the copy directly after the original.
 *
 * Elements get fresh ids — reusing them would make the copy and the original
 * the same element in the CRDT, so editing one would silently edit both.
 */
export function duplicateSlide(doc: Y.Doc, slideId: string): string | null {
  const slides = slidesMap(doc)
  const source = slides.get(slideId)
  if (!source) return null

  const newId = crypto.randomUUID()

  doc.transact(() => {
    const copy = new Y.Map<any>()
    copy.set('id', newId)
    copy.set('title', `${source.get('title') ?? 'Slide'} (copy)`)
    copy.set('background', { ...(source.get('background') ?? DEFAULT_BACKGROUND) })
    copy.set('notes', source.get('notes') ?? '')
    copy.set('createdAt', Date.now())
    copy.set('updatedAt', Date.now())

    const elements = new Y.Map<YElement>()
    for (const element of readElements(source)) {
      const fresh = { ...element, id: crypto.randomUUID() }
      elements.set(fresh.id, toYElement(fresh))
    }
    copy.set('elements', elements)

    slides.set(newId, copy)

    const order = orderArray(doc)
    const at = order.toArray().indexOf(slideId)
    order.insert(at >= 0 ? at + 1 : order.length, [newId])
    touch(doc)
  })

  return newId
}

export function deleteSlide(doc: Y.Doc, slideId: string) {
  doc.transact(() => {
    slidesMap(doc).delete(slideId)
    const order = orderArray(doc)
    const index = order.toArray().indexOf(slideId)
    if (index >= 0) order.delete(index, 1)
    touch(doc)
  })
}

export function moveSlide(doc: Y.Doc, from: number, to: number) {
  doc.transact(() => {
    const order = orderArray(doc)
    const ids = order.toArray()
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return
    const moved = ids.splice(from, 1)[0]
    if (!moved) return
    ids.splice(to, 0, moved)
    order.delete(0, order.length)
    order.insert(0, ids)
    touch(doc)
  })
}

export function updateSlide(doc: Y.Doc, slideId: string, patch: Partial<Slide>) {
  doc.transact(() => {
    const yslide = slidesMap(doc).get(slideId)
    if (!yslide) return
    for (const [key, value] of Object.entries(patch)) yslide.set(key, value)
    touch(doc, slideId)
  })
}

export function addElement(doc: Y.Doc, slideId: string, element: AnySlideElement) {
  doc.transact(() => {
    const yslide = slidesMap(doc).get(slideId)
    if (!yslide) return
    ensureElements(yslide).set(element.id, toYElement(element))
    touch(doc, slideId)
  })
}

export function updateElement(
  doc: Y.Doc,
  slideId: string,
  elementId: string,
  patch: Record<string, any>
) {
  doc.transact(() => {
    const yslide = slidesMap(doc).get(slideId)
    if (!yslide) return
    const yelement = ensureElements(yslide).get(elementId)
    if (!yelement) return
    for (const [key, value] of Object.entries(patch)) yelement.set(key, value)
    touch(doc, slideId)
  })
}

export function deleteElement(doc: Y.Doc, slideId: string, elementId: string) {
  doc.transact(() => {
    const yslide = slidesMap(doc).get(slideId)
    if (!yslide) return
    ensureElements(yslide).delete(elementId)
    touch(doc, slideId)
  })
}

/** Raise an element above every sibling by giving it the next free zIndex. */
export function bringToFront(doc: Y.Doc, slideId: string, elementId: string) {
  const yslide = slidesMap(doc).get(slideId)
  if (!yslide) return
  const top = readElements(yslide).reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0)
  updateElement(doc, slideId, elementId, { zIndex: top + 1 })
}

export function nextZIndex(slide: Slide | undefined): number {
  if (!slide || slide.elements.length === 0) return 0
  return slide.elements.reduce((max, el) => Math.max(max, el.zIndex ?? 0), 0) + 1
}
