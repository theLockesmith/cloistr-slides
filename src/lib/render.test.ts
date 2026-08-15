import { describe, expect, it, vi } from 'vitest'
import { drawSlide, handleAt, hitTest, resizeRect, wrapText } from './render'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type AnySlideElement, type Slide } from '../types/slide'

function slideWith(elements: AnySlideElement[]): Slide {
  return {
    id: 'slide-1',
    title: 'Slide 1',
    elements,
    background: { type: 'color', value: '#ffffff' },
    createdAt: 0,
    updatedAt: 0,
  }
}

function box(overrides: Partial<AnySlideElement> = {}): AnySlideElement {
  return {
    id: 'box',
    type: 'shape',
    shape: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    zIndex: 0,
    fillColor: '#000000',
    strokeColor: '#000000',
    strokeWidth: 1,
    ...overrides,
  } as AnySlideElement
}

/** Minimal 2D context that records the order of calls. */
function recordingContext() {
  const calls: string[] = []
  const record = (name: string) => (..._args: unknown[]) => {
    calls.push(name)
  }

  const ctx = {
    calls,
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    ellipse: record('ellipse'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    drawImage: record('drawImage'),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  }

  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] }
}

describe('hitTest', () => {
  it('finds an element under the point', () => {
    const slide = slideWith([box()])
    expect(hitTest(slide, 150, 150)?.id).toBe('box')
  })

  it('returns null outside every element', () => {
    expect(hitTest(slideWith([box()]), 10, 10)).toBeNull()
  })

  it('picks the topmost element where they overlap', () => {
    const slide = slideWith([
      box({ id: 'under', zIndex: 0 }),
      box({ id: 'over', zIndex: 5 }),
    ])
    expect(hitTest(slide, 150, 150)?.id).toBe('over')
  })

  it('measures to the segment for lines rather than the bounding box', () => {
    // A diagonal line's box is mostly empty; clicking a far corner must miss.
    const line = box({ id: 'line', shape: 'line', x: 0, y: 0, width: 400, height: 400 }) as any
    const slide = slideWith([line])

    expect(hitTest(slide, 200, 200)?.id).toBe('line') // on the line
    expect(hitTest(slide, 380, 20)).toBeNull() // inside the box, far from the line
  })

  it('ignores a slide that is not there', () => {
    expect(hitTest(undefined, 0, 0)).toBeNull()
  })
})

describe('handleAt', () => {
  const element = box()

  it('detects each corner', () => {
    expect(handleAt(element, 100, 100, 1)).toBe('nw')
    expect(handleAt(element, 300, 100, 1)).toBe('ne')
    expect(handleAt(element, 100, 200, 1)).toBe('sw')
    expect(handleAt(element, 300, 200, 1)).toBe('se')
  })

  it('returns null away from the corners', () => {
    expect(handleAt(element, 200, 150, 1)).toBeNull()
  })

  it('grows the hit area as the canvas shrinks', () => {
    // scale is logical px per screen px, so a small on-screen canvas needs a
    // larger logical tolerance to stay tappable.
    const offset = 20
    expect(handleAt(element, 100 + offset, 100, 1)).toBeNull()
    expect(handleAt(element, 100 + offset, 100, 6)).toBe('nw')
  })

  it('returns null with no element selected', () => {
    expect(handleAt(null, 0, 0, 1)).toBeNull()
  })
})

describe('resizeRect', () => {
  it('moves the origin when dragging a top-left handle', () => {
    expect(resizeRect(box(), 'nw', 20, 10)).toEqual({ x: 120, y: 110, width: 180, height: 90 })
  })

  it('extends without moving the origin from the bottom-right', () => {
    expect(resizeRect(box(), 'se', 20, 10)).toEqual({ x: 100, y: 100, width: 220, height: 110 })
  })

  it('never collapses below the minimum size', () => {
    const result = resizeRect(box(), 'se', -1000, -1000)
    expect(result.width).toBeGreaterThanOrEqual(16)
    expect(result.height).toBeGreaterThanOrEqual(16)
  })

  it('keeps the far edge pinned when a top-left drag hits the minimum', () => {
    const result = resizeRect(box(), 'nw', 1000, 1000)
    expect(result.width).toBe(16)
    expect(result.height).toBe(16)
    expect(result.x + result.width).toBe(300) // right edge unchanged
    expect(result.y + result.height).toBe(200) // bottom edge unchanged
  })
})

describe('wrapText', () => {
  const ctx = recordingContext()

  it('wraps on width', () => {
    // measureText is 10px per character in the stub.
    expect(wrapText(ctx, 'aaa bbb ccc', 70)).toEqual(['aaa bbb', 'ccc'])
  })

  it('honours explicit newlines', () => {
    expect(wrapText(ctx, 'one\ntwo', 1000)).toEqual(['one', 'two'])
  })

  it('keeps blank lines', () => {
    expect(wrapText(ctx, 'a\n\nb', 1000)).toEqual(['a', '', 'b'])
  })
})

describe('drawSlide', () => {
  it('resets the transform before clearing', () => {
    // Regression: zoom was applied to the context and the canvas was cleared
    // under that transform, so clearRect missed part of the frame and the
    // previous render smeared around the edges.
    const ctx = recordingContext()
    drawSlide(ctx, slideWith([box()]), { images: new Map(), scale: 1 })

    expect(ctx.calls.indexOf('setTransform')).toBeGreaterThanOrEqual(0)
    expect(ctx.calls.indexOf('setTransform')).toBeLessThan(ctx.calls.indexOf('clearRect'))
  })

  it('draws an ellipse for a circle so it fills a non-square box', () => {
    const ctx = recordingContext()
    drawSlide(ctx, slideWith([box({ shape: 'circle' } as any)]), { images: new Map(), scale: 1 })

    expect(ctx.calls).toContain('ellipse')
    expect(ctx.calls).not.toContain('arc')
  })

  it('draws nothing but the background without a slide', () => {
    const ctx = recordingContext()
    expect(() => drawSlide(ctx, undefined, { images: new Map(), scale: 1 })).not.toThrow()
    expect(ctx.calls).toContain('clearRect')
  })

  it('omits selection chrome while presenting', () => {
    const ctx = recordingContext()
    drawSlide(ctx, slideWith([box()]), {
      images: new Map(),
      selectedId: 'box',
      scale: 1,
      presenting: true,
    })

    expect(ctx.calls).not.toContain('setLineDash')
  })

  it('draws the selection outline when an element is selected', () => {
    const ctx = recordingContext()
    drawSlide(ctx, slideWith([box()]), { images: new Map(), selectedId: 'box', scale: 1 })

    expect(ctx.calls).toContain('setLineDash')
  })
})

describe('slide dimensions', () => {
  it('is 16:9', () => {
    expect(SLIDE_WIDTH / SLIDE_HEIGHT).toBeCloseTo(16 / 9)
  })
})
