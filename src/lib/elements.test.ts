import { describe, expect, it } from 'vitest'
import { createImageElement, createShapeElement, createTextElement } from './elements'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

describe('createTextElement', () => {
  it('is editable text with a visible default', () => {
    const element = createTextElement(0)
    expect(element.type).toBe('text')
    expect(element.content.length).toBeGreaterThan(0)
    expect(element.fontSize).toBeGreaterThan(0)
  })

  it('lands inside the slide', () => {
    const element = createTextElement(0)
    expect(element.x).toBeGreaterThanOrEqual(0)
    expect(element.y).toBeGreaterThanOrEqual(0)
    expect(element.x + element.width).toBeLessThanOrEqual(SLIDE_WIDTH)
    expect(element.y + element.height).toBeLessThanOrEqual(SLIDE_HEIGHT)
  })

  it('offsets successive elements so they do not hide each other', () => {
    expect(createTextElement(1).x).not.toBe(createTextElement(0).x)
  })

  it('gives every element a distinct id', () => {
    expect(createTextElement(0).id).not.toBe(createTextElement(0).id)
  })
})

describe('createShapeElement', () => {
  it.each(['rectangle', 'circle', 'triangle', 'line'] as const)('builds a %s', (shape) => {
    const element = createShapeElement(shape, 0)
    expect(element.type).toBe('shape')
    expect(element.shape).toBe(shape)
    expect(element.strokeWidth).toBeGreaterThan(0)
  })

  it('gives a line a stroke rather than a fill', () => {
    expect(createShapeElement('line', 0).fillColor).toBe('transparent')
  })
})

describe('createImageElement', () => {
  it('scales a large image down to fit the slide', () => {
    const element = createImageElement('https://example.test/x', 6000, 4000, 0)
    expect(element.width).toBeLessThanOrEqual(SLIDE_WIDTH * 0.6)
    expect(element.height).toBeLessThanOrEqual(SLIDE_HEIGHT * 0.6)
  })

  it('preserves the aspect ratio', () => {
    const element = createImageElement('https://example.test/x', 4000, 2000, 0)
    expect(element.width / element.height).toBeCloseTo(2, 1)
  })

  it('leaves a small image at its natural size', () => {
    const element = createImageElement('https://example.test/x', 320, 240, 0)
    expect(element.width).toBe(320)
    expect(element.height).toBe(240)
  })

  it('survives an image whose dimensions could not be read', () => {
    const element = createImageElement('https://example.test/x', 0, 0, 0)
    expect(element.width).toBeGreaterThan(0)
    expect(element.height).toBeGreaterThan(0)
  })
})
