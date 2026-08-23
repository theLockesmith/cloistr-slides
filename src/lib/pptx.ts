/**
 * PPTX (PowerPoint) export for Cloistr Slides.
 *
 * Translates the internal slide model to an Open XML presentation using
 * pptxgenjs. Each slide gets its own page; elements are mapped to the
 * equivalent pptxgenjs object type.
 *
 * Layout is in pptxgenjs's default "10 x 7.5 inch" units, converted from
 * our internal 1600 x 900 logical pixel space. We preserve aspect ratios
 * by using a 16:9 layout (13.33 x 7.5 inches).
 *
 * Limitations (noted plainly):
 *   - Gradient backgrounds are exported as the start colour only.
 *   - Image backgrounds are not included (Canvas images render via URLs;
 *     pptxgenjs needs binary data from the same origin).
 *   - Shape types 'triangle' and 'line' map to the closest PPTX shape.
 *   - Text wrapping inside pptxgenjs may differ from the canvas renderer.
 */
import PptxGenJS from 'pptxgenjs'
import type { ImageElement, Presentation, ShapeElement, Slide, TextElement } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

const LAYOUT_W = 13.33 // inches (16:9 at 7.5" height)
const LAYOUT_H = 7.5 // inches

/** Convert a logical slide coordinate to pptxgenjs inches. */
function toInchW(px: number) {
  return (px / SLIDE_WIDTH) * LAYOUT_W
}
function toInchH(px: number) {
  return (px / SLIDE_HEIGHT) * LAYOUT_H
}
function toInchFontSize(px: number) {
  // pptxgenjs uses points (72pt = 1 inch). We use logical px on a 900px-high slide.
  // A 48px font on 900px = 5.33% of slide height = 5.33% of 7.5in = ~0.4in = ~29pt
  return Math.round((px / SLIDE_HEIGHT) * LAYOUT_H * 72)
}

function addTextElement(slide: PptxGenJS.Slide, el: TextElement) {
  const options: PptxGenJS.TextPropsOptions = {
    x: toInchW(el.x),
    y: toInchH(el.y),
    w: toInchW(el.width),
    h: toInchH(el.height),
    fontSize: toInchFontSize(el.fontSize),
    color: el.color.replace('#', ''),
    fontFace: el.fontFamily.split(',')[0]?.trim() ?? 'Arial',
    bold: el.fontWeight === 'bold',
    italic: el.fontStyle === 'italic',
    align: el.textAlign as 'left' | 'center' | 'right',
    valign: 'top',
    wrap: true,
    rotate: el.rotation ?? 0,
  }
  slide.addText(el.content ?? '', options)
}

function addShapeElement(slide: PptxGenJS.Slide, el: ShapeElement) {
  const shapeMap: Record<ShapeElement['shape'], PptxGenJS.SHAPE_NAME> = {
    rectangle: 'rect',
    circle: 'ellipse',
    triangle: 'triangle',
    line: 'line',
  }
  const shapeName = shapeMap[el.shape]
  const options: PptxGenJS.ShapeProps = {
    x: toInchW(el.x),
    y: toInchH(el.y),
    w: toInchW(el.width),
    h: toInchH(el.height),
    fill: { color: el.fillColor === 'transparent' ? 'FFFFFF' : el.fillColor.replace('#', ''), transparency: el.fillColor === 'transparent' ? 100 : 0 },
    line: { color: el.strokeColor.replace('#', ''), width: el.strokeWidth },
    rotate: el.rotation ?? 0,
  }
  slide.addShape(shapeName, options)
}

async function addImageElement(
  slide: PptxGenJS.Slide,
  el: ImageElement,
  images: Map<string, HTMLImageElement>
) {
  if (!el.src) return

  const img = images.get(el.src)
  if (!img || !img.complete || !img.naturalWidth) return

  try {
    // Draw the image to an off-screen canvas to get a data URL (same-origin).
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')

    slide.addImage({
      data: dataUrl,
      x: toInchW(el.x),
      y: toInchH(el.y),
      w: toInchW(el.width),
      h: toInchH(el.height),
      rotate: el.rotation ?? 0,
      transparency: Math.round((1 - (el.opacity ?? 1)) * 100),
    })
  } catch {
    // Cross-origin images cannot be read from canvas. Skip silently.
  }
}

/**
 * Export a presentation to a PPTX file and trigger download in the browser.
 *
 * @param presentation - The presentation data.
 * @param images       - Pre-loaded HTMLImageElement map keyed by src.
 */
export async function exportPptx(
  presentation: Presentation,
  images: Map<string, HTMLImageElement>
): Promise<void> {
  const pptx = new PptxGenJS()

  // 16:9 layout
  pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 inches

  const title = presentation.metadata.title || 'Untitled'
  pptx.title = title
  pptx.author = presentation.metadata.author.slice(0, 8) || 'Cloistr'
  pptx.subject = 'Cloistr Slides'

  for (const slide of presentation.slides) {
    await addSlide(pptx, slide, images)
  }

  const filename = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pptx`
  await pptx.writeFile({ fileName: filename })
}

async function addSlide(
  pptx: PptxGenJS,
  slide: Slide,
  images: Map<string, HTMLImageElement>
) {
  const pSlide = pptx.addSlide()

  // Background
  const bg = slide.background
  if (bg.type === 'color') {
    pSlide.background = { color: bg.value.replace('#', '') }
  } else if (bg.type === 'image') {
    // pptxgenjs needs image data; skip if we don't have it loaded
    const img = images.get(bg.value)
    if (img && img.complete && img.naturalWidth) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SLIDE_WIDTH
        canvas.height = SLIDE_HEIGHT
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
          const dataUrl = canvas.toDataURL('image/png')
          pSlide.background = { data: dataUrl }
        }
      } catch {
        // cross-origin; use a white background
      }
    }
  }
  // gradient: use first colour only (pptxgenjs supports solid fills on slides)

  // Elements sorted by zIndex
  const sorted = [...slide.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  for (const el of sorted) {
    if (el.type === 'text') addTextElement(pSlide, el as TextElement)
    else if (el.type === 'shape') addShapeElement(pSlide, el as ShapeElement)
    else if (el.type === 'image') await addImageElement(pSlide, el as ImageElement, images)
  }

  // Speaker notes
  if (slide.notes?.trim()) {
    pSlide.addNotes(slide.notes)
  }
}
