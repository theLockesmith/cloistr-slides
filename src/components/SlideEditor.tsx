import React, { useState, useEffect, useRef } from 'react'
import * as Y from 'yjs'
import type { Presentation, Slide, AnySlideElement } from '../types/slide'

interface SlideEditorProps {
  presentation: Presentation
  onPresentationChange: (presentation: Presentation) => void
}

// Yjs document for collaborative editing
const ydoc = new Y.Doc()
const yslides = ydoc.getMap<Y.Map<any>>('slides')
const ymetadata = ydoc.getMap('metadata')

export const SlideEditor: React.FC<SlideEditorProps> = ({
  presentation,
  onPresentationChange,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [selectedElementIds] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const [panX] = useState(0)
  const [panY] = useState(0)

  const currentSlide = presentation.slides[currentSlideIndex]

  // Initialize Yjs with current presentation data
  useEffect(() => {
    // Initialize metadata
    if (!ymetadata.get('title')) {
      ymetadata.set('title', presentation.metadata.title)
      ymetadata.set('description', presentation.metadata.description)
      ymetadata.set('author', presentation.metadata.author)
    }

    // Initialize slides
    presentation.slides.forEach((slide) => {
      if (!yslides.has(slide.id)) {
        const yslide = new Y.Map()
        yslide.set('id', slide.id)
        yslide.set('title', slide.title)
        yslide.set('elements', new Y.Array())
        yslide.set('background', slide.background)
        yslide.set('notes', slide.notes || '')
        yslides.set(slide.id, yslide)
      }
    })

    // Listen for changes
    const updateHandler = () => {
      // Sync changes back to local state
      // This is a placeholder - in real implementation would need proper sync
      console.log('Yjs document updated')
    }

    ydoc.on('update', updateHandler)
    return () => ydoc.off('update', updateHandler)
  }, [presentation])

  // Canvas drawing logic (placeholder)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!currentSlide) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Apply transform
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY)

    // Draw background
    if (currentSlide.background.type === 'color') {
      ctx.fillStyle = currentSlide.background.value
      ctx.fillRect(0, 0, canvas.width / zoom, canvas.height / zoom)
    }

    // Draw elements
    currentSlide.elements.forEach((element) => {
      ctx.save()
      ctx.translate(element.x, element.y)
      if (element.rotation) {
        ctx.rotate((element.rotation * Math.PI) / 180)
      }

      switch (element.type) {
        case 'text':
          const textEl = element as any // Type assertion for demo
          ctx.fillStyle = textEl.color || '#000000'
          ctx.font = `${textEl.fontSize}px ${textEl.fontFamily}`
          ctx.fillText(textEl.content, 0, 0)
          break

        case 'shape':
          const shapeEl = element as any
          ctx.fillStyle = shapeEl.fillColor
          ctx.strokeStyle = shapeEl.strokeColor
          ctx.lineWidth = shapeEl.strokeWidth

          if (shapeEl.shape === 'rectangle') {
            ctx.fillRect(0, 0, element.width, element.height)
            ctx.strokeRect(0, 0, element.width, element.height)
          } else if (shapeEl.shape === 'circle') {
            ctx.beginPath()
            ctx.arc(element.width / 2, element.height / 2, element.width / 2, 0, 2 * Math.PI)
            ctx.fill()
            ctx.stroke()
          }
          break

        case 'image':
          // Image drawing would go here
          ctx.fillStyle = '#cccccc'
          ctx.fillRect(0, 0, element.width, element.height)
          ctx.strokeStyle = '#999999'
          ctx.strokeRect(0, 0, element.width, element.height)
          break
      }

      // Draw selection indicators
      if (selectedElementIds.includes(element.id)) {
        ctx.strokeStyle = '#0066cc'
        ctx.lineWidth = 2
        ctx.strokeRect(-2, -2, element.width + 4, element.height + 4)
      }

      ctx.restore()
    })
  }, [currentSlide, zoom, panX, panY, selectedElementIds])

  const addTextElement = () => {
    if (!currentSlide) return

    const newElement: AnySlideElement = {
      id: crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      zIndex: currentSlide.elements.length,
      content: 'New Text',
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#000000',
      textAlign: 'left',
      lineHeight: 1.2,
    } as any

    if (!currentSlide) return

    const updatedSlide: Slide = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
      updatedAt: Date.now(),
    }

    const updatedPresentation = {
      ...presentation,
      slides: presentation.slides.map((slide, index) =>
        index === currentSlideIndex ? updatedSlide : slide
      ),
    }

    onPresentationChange(updatedPresentation)

    // Update Yjs document
    const yslide = yslides.get(updatedSlide.id)
    if (yslide) {
      const yelements = yslide.get('elements') as Y.Array<any>
      yelements.push([newElement])
    }
  }

  const addNewSlide = () => {
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      title: `Slide ${presentation.slides.length + 1}`,
      elements: [],
      background: {
        type: 'color',
        value: '#ffffff',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const updatedPresentation = {
      ...presentation,
      slides: [...presentation.slides, newSlide],
    }

    onPresentationChange(updatedPresentation)
    setCurrentSlideIndex(presentation.slides.length)

    // Add to Yjs
    const yslide = new Y.Map()
    yslide.set('id', newSlide.id)
    yslide.set('title', newSlide.title)
    yslide.set('elements', new Y.Array())
    yslide.set('background', newSlide.background)
    yslides.set(newSlide.id, yslide)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Slide Thumbnails Panel */}
      <div style={{
        width: '200px',
        backgroundColor: '#f0f0f0',
        borderRight: '1px solid #ccc',
        overflowY: 'auto',
        padding: '1rem'
      }}>
        <h3>Slides</h3>
        <button onClick={addNewSlide} style={{ width: '100%', marginBottom: '1rem' }}>
          + Add Slide
        </button>

        {presentation.slides.map((slide, index) => (
          <div
            key={slide.id}
            onClick={() => setCurrentSlideIndex(index)}
            style={{
              padding: '0.5rem',
              marginBottom: '0.5rem',
              backgroundColor: index === currentSlideIndex ? '#e0e0e0' : '#ffffff',
              border: '1px solid #ccc',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
              {index + 1}. {slide.title}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#666' }}>
              {slide.elements.length} elements
            </div>
          </div>
        ))}
      </div>

      {/* Main Canvas Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <div style={{
          padding: '0.5rem',
          backgroundColor: '#f8f8f8',
          borderBottom: '1px solid #ccc',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center'
        }}>
          <button onClick={addTextElement}>Add Text</button>
          <button onClick={() => console.log('Add Shape')}>Add Shape</button>
          <button onClick={() => console.log('Add Image')}>Add Image</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label>Zoom:</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
            />
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Canvas Container */}
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#e8e8e8'
        }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            }}
            onMouseDown={(e) => {
              // Handle element selection and canvas interaction
              console.log('Canvas clicked:', e.clientX, e.clientY)
            }}
          />
        </div>
      </div>

      {/* Properties Panel */}
      <div style={{
        width: '250px',
        backgroundColor: '#f0f0f0',
        borderLeft: '1px solid #ccc',
        padding: '1rem'
      }}>
        <h3>Properties</h3>
        {selectedElementIds.length > 0 ? (
          <div>
            <p>Selected: {selectedElementIds.length} element(s)</p>
            {/* Element properties would go here */}
          </div>
        ) : (
          <div>
            <h4>Slide Properties</h4>
            <label>
              Background Color:
              <input
                type="color"
                value={currentSlide?.background.value || '#ffffff'}
                onChange={(e) => {
                  if (!currentSlide) return
                  const updatedSlide: Slide = {
                    ...currentSlide,
                    background: { type: 'color' as const, value: e.target.value },
                    updatedAt: Date.now(),
                  }
                  const updatedPresentation = {
                    ...presentation,
                    slides: presentation.slides.map((slide, index) =>
                      index === currentSlideIndex ? updatedSlide : slide
                    ),
                  }
                  onPresentationChange(updatedPresentation)
                }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}