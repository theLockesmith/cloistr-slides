/**
 * Canvas rendering and hit testing for a slide.
 *
 * Everything here works in the slide's own logical coordinate space
 * (SLIDE_WIDTH x SLIDE_HEIGHT). The canvas backing store is exactly that size
 * and CSS scales it to fit, so a pointer position converts with one multiply
 * and zoom never touches the 2D context. The previous version applied zoom as a
 * ctx transform but cleared the canvas *before* resetting it, so zooming in
 * left the old frame smeared around the edges.
 */
import type { AnySlideElement, ImageElement, ShapeElement, Slide, TextElement } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

export type HandleId = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_SCREEN_PX = 9
const SELECTION_COLOR = '#0066cc'

export interface DrawOptions {
  /** Loaded images keyed by src; missing entries render as a placeholder. */
  images: Map<string, HTMLImageElement>
  selectedId?: string | null
  /** Logical px per screen px — keeps handles and outlines a constant size. */
  scale: number
  /** Presenting hides selection chrome and element placeholders. */
  presenting?: boolean
}

function byZIndex(elements: AnySlideElement[]): AnySlideElement[] {
  return [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
}

/** Split text into lines that fit `maxWidth`, honouring explicit newlines. */
export function wrapText(ctx: CanvasRenderingContext2D, content: string, maxWidth: number): string[] {
  const lines: string[] = []

  for (const paragraph of content.split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }

  return lines
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.fillStyle = el.color || '#000000'
  ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${el.fontSize}px ${el.fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = el.textAlign || 'left'

  // textAlign is relative to this anchor, so it has to move with the alignment.
  const anchorX = el.textAlign === 'center' ? el.width / 2 : el.textAlign === 'right' ? el.width : 0
  const lineHeight = el.fontSize * (el.lineHeight || 1.2)

  wrapText(ctx, el.content ?? '', el.width).forEach((line, index) => {
    ctx.fillText(line, anchorX, index * lineHeight)
  })
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  ctx.fillStyle = el.fillColor || 'transparent'
  ctx.strokeStyle = el.strokeColor || '#000000'
  ctx.lineWidth = el.strokeWidth ?? 1

  switch (el.shape) {
    case 'rectangle':
      ctx.fillRect(0, 0, el.width, el.height)
      if (ctx.lineWidth > 0) ctx.strokeRect(0, 0, el.width, el.height)
      break

    case 'circle':
      // Ellipse, not arc — an arc used the width as the radius in both axes, so
      // any non-square box drew a circle that overflowed or underfilled it.
      ctx.beginPath()
      ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, 2 * Math.PI)
      ctx.fill()
      if (ctx.lineWidth > 0) ctx.stroke()
      break

    case 'triangle':
      ctx.beginPath()
      ctx.moveTo(el.width / 2, 0)
      ctx.lineTo(el.width, el.height)
      ctx.lineTo(0, el.height)
      ctx.closePath()
      ctx.fill()
      if (ctx.lineWidth > 0) ctx.stroke()
      break

    case 'line':
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(el.width, el.height)
      ctx.stroke()
      break
  }
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  images: Map<string, HTMLImageElement>,
  presenting: boolean
) {
  const img = el.src ? images.get(el.src) : undefined

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.globalAlpha = el.opacity ?? 1
    ctx.drawImage(img, 0, 0, el.width, el.height)
    ctx.globalAlpha = 1
    return
  }

  if (presenting) return

  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, 0, el.width, el.height)
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 1
  ctx.strokeRect(0, 0, el.width, el.height)
  ctx.fillStyle = '#6b7280'
  ctx.font = '16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(el.src ? 'Loading image…' : 'No image', el.width / 2, el.height / 2)
}

function drawSelection(ctx: CanvasRenderingContext2D, el: AnySlideElement, scale: number) {
  const handle = HANDLE_SCREEN_PX * scale

  ctx.strokeStyle = SELECTION_COLOR
  ctx.lineWidth = Math.max(1, 1.5 * scale)
  ctx.setLineDash([6 * scale, 4 * scale])
  ctx.strokeRect(0, 0, el.width, el.height)
  ctx.setLineDash([])

  ctx.fillStyle = '#ffffff'
  for (const [hx, hy] of cornerOffsets(el)) {
    ctx.fillRect(hx - handle / 2, hy - handle / 2, handle, handle)
    ctx.strokeRect(hx - handle / 2, hy - handle / 2, handle, handle)
  }
}

function cornerOffsets(el: { width: number; height: number }): Array<[number, number]> {
  return [
    [0, 0],
    [el.width, 0],
    [0, el.height],
    [el.width, el.height],
  ]
}

export function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: Slide | undefined,
  options: DrawOptions
) {
  const { images, selectedId, scale, presenting = false } = options

  // Reset before clearing — a leftover transform means clearRect misses part of
  // the canvas and the previous frame bleeds through.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)

  if (!slide) return

  const background = slide.background
  if (background?.type === 'color') {
    ctx.fillStyle = background.value
    ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
  } else if (background?.type === 'image') {
    const img = images.get(background.value)
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    }
  }

  for (const element of byZIndex(slide.elements)) {
    ctx.save()
    ctx.translate(element.x, element.y)
    if (element.rotation) {
      ctx.translate(element.width / 2, element.height / 2)
      ctx.rotate((element.rotation * Math.PI) / 180)
      ctx.translate(-element.width / 2, -element.height / 2)
    }

    if (element.type === 'text') drawText(ctx, element as TextElement)
    else if (element.type === 'shape') drawShape(ctx, element as ShapeElement)
    else if (element.type === 'image') drawImage(ctx, element as ImageElement, images, presenting)

    if (!presenting && selectedId === element.id) drawSelection(ctx, element, scale)

    ctx.restore()
  }
}

/** Topmost element containing the point, or null. */
export function hitTest(slide: Slide | undefined, x: number, y: number): AnySlideElement | null {
  if (!slide) return null

  for (const element of byZIndex(slide.elements).reverse()) {
    if (element.type === 'shape' && (element as ShapeElement).shape === 'line') {
      // A line's bounding box is mostly empty space; measure to the segment.
      const tolerance = Math.max(6, ((element as ShapeElement).strokeWidth ?? 1) * 2)
      if (distanceToSegment(x, y, element.x, element.y, element.x + element.width, element.y + element.height) <= tolerance) {
        return element
      }
      continue
    }

    if (
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    ) {
      return element
    }
  }

  return null
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1)

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Which resize handle the point is over, if any. */
export function handleAt(
  element: AnySlideElement | null,
  x: number,
  y: number,
  scale: number
): HandleId | null {
  if (!element) return null

  const tolerance = (HANDLE_SCREEN_PX * scale) / 2 + 2 * scale
  const ids: HandleId[] = ['nw', 'ne', 'sw', 'se']

  const corners = cornerOffsets(element)

  return (
    ids.find((_, index) => {
      const corner = corners[index]
      if (!corner) return false
      const [ox, oy] = corner
      return Math.abs(x - (element.x + ox)) <= tolerance && Math.abs(y - (element.y + oy)) <= tolerance
    }) ?? null
  )
}

/** Apply a corner drag, keeping width/height positive and above a floor. */
export function resizeRect(
  element: AnySlideElement,
  handle: HandleId,
  dx: number,
  dy: number
): { x: number; y: number; width: number; height: number } {
  const MIN = 16
  let { x, y, width, height } = element

  if (handle === 'nw' || handle === 'sw') {
    const clamped = Math.min(dx, width - MIN)
    x += clamped
    width -= clamped
  } else {
    width = Math.max(MIN, width + dx)
  }

  if (handle === 'nw' || handle === 'ne') {
    const clamped = Math.min(dy, height - MIN)
    y += clamped
    height -= clamped
  } else {
    height = Math.max(MIN, height + dy)
  }

  return { x, y, width, height }
}

export { SLIDE_HEIGHT, SLIDE_WIDTH }
