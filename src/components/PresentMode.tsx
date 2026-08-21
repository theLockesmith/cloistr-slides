import React, { useCallback, useEffect, useRef } from 'react'
import { drawSlide } from '../lib/render'
import type { Slide } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

interface PresentModeProps {
  slides: Slide[]
  index: number
  images: Map<string, HTMLImageElement>
  onIndexChange: (index: number) => void
  onExit: () => void
}

export const PresentMode: React.FC<PresentModeProps> = ({
  slides,
  index,
  images,
  onIndexChange,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const slide = slides[index]

  const next = useCallback(() => {
    if (index < slides.length - 1) onIndexChange(index + 1)
  }, [index, slides.length, onIndexChange])

  const previous = useCallback(() => {
    if (index > 0) onIndexChange(index - 1)
  }, [index, onIndexChange])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit()
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault()
        next()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        previous()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, previous, onExit])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawSlide(ctx, slide, { images, scale: 1, presenting: true })
  }, [slide, images])

  const notes = slide?.notes?.trim() ?? ''

  return (
    <div className="slides-present" role="dialog" aria-modal="true" aria-label="Presentation">
      <canvas
        ref={canvasRef}
        width={SLIDE_WIDTH}
        height={SLIDE_HEIGHT}
        className="slides-present-canvas"
        onClick={next}
      />

      {notes && (
        <div className="slides-present-notes" aria-label="Speaker notes">
          <span className="slides-present-notes-label">Notes</span>
          <p className="slides-present-notes-text">{notes}</p>
        </div>
      )}

      <div className="slides-present-controls">
        <button type="button" onClick={previous} disabled={index === 0} aria-label="Previous slide">
          ‹
        </button>
        <span>
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={next}
          disabled={index >= slides.length - 1}
          aria-label="Next slide"
        >
          ›
        </button>
        <button type="button" onClick={onExit}>
          Exit
        </button>
      </div>
    </div>
  )
}
