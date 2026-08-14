/**
 * Factories for new slide elements.
 *
 * New elements land near the middle of the slide rather than at a fixed (100,
 * 100) so that adding several in a row doesn't stack them all in one spot.
 */
import type { ImageElement, ShapeElement, TextElement } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

/** Nudge each successive element down-right so they don't hide each other. */
function placement(width: number, height: number, index: number) {
  const offset = (index % 6) * 32
  return {
    x: Math.round((SLIDE_WIDTH - width) / 2) + offset,
    y: Math.round((SLIDE_HEIGHT - height) / 2) + offset,
    width,
    height,
  }
}

export function createTextElement(zIndex: number): TextElement {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    ...placement(640, 120, zIndex),
    zIndex,
    content: 'New text',
    fontSize: 48,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#111827',
    textAlign: 'left',
    lineHeight: 1.25,
  }
}

export function createShapeElement(shape: ShapeElement['shape'], zIndex: number): ShapeElement {
  const size = shape === 'line' ? { width: 480, height: 0 } : { width: 400, height: 280 }

  return {
    id: crypto.randomUUID(),
    type: 'shape',
    ...placement(size.width, Math.max(size.height, 1), zIndex),
    height: size.height,
    zIndex,
    shape,
    fillColor: shape === 'line' ? 'transparent' : '#3b82f6',
    strokeColor: '#1d4ed8',
    strokeWidth: shape === 'line' ? 4 : 2,
  }
}

export function createImageElement(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  zIndex: number
): ImageElement {
  // Fit inside the slide while preserving aspect ratio; a phone photo pasted at
  // its natural size would otherwise be many times the slide.
  const maxWidth = SLIDE_WIDTH * 0.6
  const maxHeight = SLIDE_HEIGHT * 0.6
  const ratio = Math.min(maxWidth / (naturalWidth || maxWidth), maxHeight / (naturalHeight || maxHeight), 1)
  const width = Math.round((naturalWidth || maxWidth) * ratio)
  const height = Math.round((naturalHeight || maxHeight) * ratio)

  return {
    id: crypto.randomUUID(),
    type: 'image',
    ...placement(width, height, zIndex),
    zIndex,
    src,
    alt: '',
    opacity: 1,
  }
}

/** Read a file's intrinsic size so the element is created at the right ratio. */
export function measureImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
