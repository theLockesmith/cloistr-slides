import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  addElement,
  createSlide,
  deleteElement,
  deleteSlide,
  ensureElements,
  moveSlide,
  nextZIndex,
  readSnapshot,
  slideIds,
  slidesMap,
  updateElement,
  updateSlide,
} from './ydoc'
import { createShapeElement, createTextElement } from './elements'

const emptyDoc = () => new Y.Doc()

describe('slide ordering', () => {
  it('keeps slides in insertion order', () => {
    const doc = emptyDoc()
    const first = createSlide(doc)
    const second = createSlide(doc)
    const third = createSlide(doc)

    expect(slideIds(doc)).toEqual([first, second, third])
  })

  it('inserts at an index', () => {
    const doc = emptyDoc()
    const first = createSlide(doc)
    const last = createSlide(doc)
    const middle = createSlide(doc, 1)

    expect(slideIds(doc)).toEqual([first, middle, last])
  })

  it('reorders without losing slides', () => {
    const doc = emptyDoc()
    const a = createSlide(doc)
    const b = createSlide(doc)
    const c = createSlide(doc)

    moveSlide(doc, 2, 0)
    expect(slideIds(doc)).toEqual([c, a, b])
  })

  it('drops the order entry when a slide is deleted', () => {
    const doc = emptyDoc()
    const a = createSlide(doc)
    const b = createSlide(doc)

    deleteSlide(doc, a)
    expect(slideIds(doc)).toEqual([b])
    expect(readSnapshot(doc).slides).toHaveLength(1)
  })

  it('surfaces slides that no order entry points at', () => {
    // A peer on a build that predates slideOrder writes straight to the map.
    // Those slides must still be reachable rather than silently disappearing.
    const doc = emptyDoc()
    const tracked = createSlide(doc)

    const orphan = new Y.Map<any>()
    orphan.set('id', 'orphan-slide')
    orphan.set('title', 'Written by an old peer')
    orphan.set('elements', new Y.Map())
    slidesMap(doc).set('orphan-slide', orphan)

    expect(slideIds(doc)).toEqual([tracked, 'orphan-slide'])
  })
})

describe('elements', () => {
  it('round-trips an added element through the document', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    const text = createTextElement(0)

    addElement(doc, slideId, text)

    const [slide] = readSnapshot(doc).slides
    expect(slide!.elements).toHaveLength(1)
    expect(slide!.elements[0]).toMatchObject({ id: text.id, type: 'text', content: 'New text' })
  })

  it('patches a single field without disturbing the others', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    const shape = createShapeElement('rectangle', 0)
    addElement(doc, slideId, shape)

    updateElement(doc, slideId, shape.id, { x: 42 })

    const element = readSnapshot(doc).slides[0]!.elements[0]!
    expect(element.x).toBe(42)
    expect((element as any).fillColor).toBe(shape.fillColor)
    expect(element.y).toBe(shape.y)
  })

  it('sorts elements by zIndex', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    const bottom = createTextElement(0)
    const top = createTextElement(5)

    addElement(doc, slideId, top)
    addElement(doc, slideId, bottom)

    expect(readSnapshot(doc).slides[0]!.elements.map((el) => el.id)).toEqual([bottom.id, top.id])
  })

  it('removes an element', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    const text = createTextElement(0)
    addElement(doc, slideId, text)

    deleteElement(doc, slideId, text.id)
    expect(readSnapshot(doc).slides[0]!.elements).toHaveLength(0)
  })

  it('hands out a zIndex above every sibling', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    addElement(doc, slideId, createTextElement(0))
    addElement(doc, slideId, { ...createTextElement(0), zIndex: 7 })

    expect(nextZIndex(readSnapshot(doc).slides[0])).toBe(8)
  })

  it('migrates elements stored as a legacy Y.Array', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)
    const yslide = slidesMap(doc).get(slideId)!

    const legacy = new Y.Array<any>()
    legacy.push([{ id: 'legacy-1', type: 'text', x: 1, y: 2, width: 3, height: 4, zIndex: 0 }])
    yslide.set('elements', legacy)

    // Readable before migration...
    expect(readSnapshot(doc).slides[0]!.elements[0]!.id).toBe('legacy-1')

    // ...and converted to the keyed map on first write, without loss.
    ensureElements(yslide)
    expect(yslide.get('elements')).toBeInstanceOf(Y.Map)
    expect(readSnapshot(doc).slides[0]!.elements[0]!.id).toBe('legacy-1')
  })
})

describe('slide properties', () => {
  it('updates background and notes', () => {
    const doc = emptyDoc()
    const slideId = createSlide(doc)

    updateSlide(doc, slideId, {
      background: { type: 'color', value: '#ff0000' },
      notes: 'remember to breathe',
    })

    const slide = readSnapshot(doc).slides[0]!
    expect(slide.background.value).toBe('#ff0000')
    expect(slide.notes).toBe('remember to breathe')
  })
})

describe('collaboration', () => {
  it('applies a remote peer edit to the local snapshot', () => {
    // The defect this whole layer exists to prevent: edits arriving through
    // Yjs never reached the rendered presentation.
    const local = emptyDoc()
    const remote = emptyDoc()

    const slideId = createSlide(remote)
    addElement(remote, slideId, createTextElement(0))

    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote))

    expect(readSnapshot(local).slides).toHaveLength(1)
    expect(readSnapshot(local).slides[0]!.elements).toHaveLength(1)
  })

  it('converges when two peers move different elements at once', () => {
    const a = emptyDoc()
    const slideId = createSlide(a)
    const one = createTextElement(0)
    const two = createTextElement(1)
    addElement(a, slideId, one)
    addElement(a, slideId, two)

    const b = emptyDoc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    updateElement(a, slideId, one.id, { x: 111 })
    updateElement(b, slideId, two.id, { x: 222 })

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    for (const doc of [a, b]) {
      const elements = readSnapshot(doc).slides[0]!.elements
      expect(elements).toHaveLength(2)
      expect(elements.find((el) => el.id === one.id)!.x).toBe(111)
      expect(elements.find((el) => el.id === two.id)!.x).toBe(222)
    }
  })
})
