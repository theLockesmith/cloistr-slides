import React, { useCallback, useEffect, useRef, useState } from 'react'
import { drawSlide } from '../lib/render'
import type { Slide, SlideTransition } from '../types/slide'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../types/slide'

interface PresentModeProps {
  slides: Slide[]
  index: number
  images: Map<string, HTMLImageElement>
  onIndexChange: (index: number) => void
  onExit: () => void
}

/**
 * Run a CSS transition animation on the canvas wrap element.
 *
 * We apply a class that CSS already has keyframe rules for, wait for the
 * animation to end, and then remove it. This keeps animation state out of
 * React and avoids re-rendering the canvas.
 */
function animateTransition(el: HTMLElement | null, type: SlideTransition, direction: 'forward' | 'backward') {
  if (!el || type === 'none') return
  const cls = `anim-${type}-${direction}`
  el.classList.add(cls)
  const onEnd = () => {
    el.classList.remove(cls)
    el.removeEventListener('animationend', onEnd)
  }
  el.addEventListener('animationend', onEnd)
}

export const PresentMode: React.FC<PresentModeProps> = ({
  slides,
  index,
  images,
  onIndexChange,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [presenterView, setPresenterView] = useState(false)
  const slide = slides[index]
  const prevIndexRef = useRef(index)

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
      } else if (event.key === 'p' || event.key === 'P') {
        setPresenterView((v) => !v)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, previous, onExit])

  // Draw current slide. Run the transition animation whenever the index changes.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawSlide(ctx, slide, { images, scale: 1, presenting: true })

    const direction = index >= prevIndexRef.current ? 'forward' : 'backward'
    const transition = slides[prevIndexRef.current]?.transition ?? 'none'

    if (index !== prevIndexRef.current) {
      animateTransition(wrapRef.current, transition, direction)
    }
    prevIndexRef.current = index
  }, [slide, images, index, slides])

  const notes = slide?.notes?.trim() ?? ''
  const nextSlide = slides[index + 1]

  // Presenter view: a two-panel layout with the slide on the left, notes and
  // next-slide preview on the right.
  if (presenterView) {
    return (
      <div className="slides-presenter" role="dialog" aria-modal="true" aria-label="Presenter view">
        <div className="slides-presenter-main">
          <div className="slides-presenter-current" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              width={SLIDE_WIDTH}
              height={SLIDE_HEIGHT}
              className="slides-present-canvas"
              onClick={next}
            />
          </div>
          <div className="slides-presenter-controls">
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
            <button type="button" onClick={() => setPresenterView(false)}>
              Audience view
            </button>
            <button type="button" onClick={onExit}>
              Exit
            </button>
          </div>
        </div>

        <div className="slides-presenter-sidebar">
          {nextSlide && (
            <div className="slides-presenter-next">
              <span className="slides-present-notes-label">Up next</span>
              <NextSlidePreview slide={nextSlide} images={images} />
            </div>
          )}

          {notes ? (
            <div className="slides-present-notes" aria-label="Speaker notes">
              <span className="slides-present-notes-label">Notes</span>
              <p className="slides-present-notes-text">{notes}</p>
            </div>
          ) : (
            <p className="slides-presenter-no-notes">No notes for this slide.</p>
          )}
        </div>
      </div>
    )
  }

  // Audience view: full-screen slide only.
  return (
    <div className="slides-present" role="dialog" aria-modal="true" aria-label="Presentation">
      <div ref={wrapRef} className="slides-present-wrap">
        <canvas
          ref={canvasRef}
          width={SLIDE_WIDTH}
          height={SLIDE_HEIGHT}
          className="slides-present-canvas"
          onClick={next}
        />
      </div>

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
        <button type="button" onClick={() => setPresenterView(true)} title="Open presenter view (P)">
          Presenter view
        </button>
        <button type="button" onClick={onExit}>
          Exit
        </button>
      </div>
    </div>
  )
}

/** Small preview canvas showing the next slide in presenter view. */
const NextSlidePreview: React.FC<{
  slide: Slide
  images: Map<string, HTMLImageElement>
}> = ({ slide, images }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawSlide(ctx, slide, { images, scale: 1, presenting: true })
  }, [slide, images])

  return (
    <canvas
      ref={canvasRef}
      width={SLIDE_WIDTH}
      height={SLIDE_HEIGHT}
      className="slides-presenter-next-canvas"
      aria-label="Next slide preview"
    />
  )
}
