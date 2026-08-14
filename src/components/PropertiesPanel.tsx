import React from 'react'
import type { AnySlideElement, ImageElement, ShapeElement, Slide, TextElement } from '../types/slide'

interface PropertiesPanelProps {
  slide: Slide | undefined
  element: AnySlideElement | null
  onElementChange: (patch: Record<string, any>) => void
  onSlideChange: (patch: Partial<Slide>) => void
  onDeleteElement: () => void
}

const FONTS = [
  'Inter, system-ui, sans-serif',
  'Georgia, serif',
  'Menlo, monospace',
  'Arial, sans-serif',
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="slides-field">
      <span className="slides-field-label">{label}</span>
      {children}
    </label>
  )
}

function TextProperties({
  element,
  onChange,
}: {
  element: TextElement
  onChange: (patch: Record<string, any>) => void
}) {
  return (
    <>
      <Field label="Content">
        <textarea
          rows={4}
          value={element.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </Field>
      <Field label="Font">
        <select value={element.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })}>
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {font.split(',')[0]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Size — ${element.fontSize}px`}>
        <input
          type="range"
          min={8}
          max={160}
          value={element.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        />
      </Field>
      <Field label="Colour">
        <input type="color" value={element.color} onChange={(e) => onChange({ color: e.target.value })} />
      </Field>
      <Field label="Align">
        <select value={element.textAlign} onChange={(e) => onChange({ textAlign: e.target.value })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Field>
      <div className="slides-inline">
        <button
          type="button"
          aria-pressed={element.fontWeight === 'bold'}
          onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
        >
          Bold
        </button>
        <button
          type="button"
          aria-pressed={element.fontStyle === 'italic'}
          onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
        >
          Italic
        </button>
      </div>
    </>
  )
}

function ShapeProperties({
  element,
  onChange,
}: {
  element: ShapeElement
  onChange: (patch: Record<string, any>) => void
}) {
  return (
    <>
      <Field label="Shape">
        <select value={element.shape} onChange={(e) => onChange({ shape: e.target.value })}>
          <option value="rectangle">Rectangle</option>
          <option value="circle">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="line">Line</option>
        </select>
      </Field>
      {element.shape !== 'line' && (
        <Field label="Fill">
          <input
            type="color"
            value={element.fillColor === 'transparent' ? '#3b82f6' : element.fillColor}
            onChange={(e) => onChange({ fillColor: e.target.value })}
          />
        </Field>
      )}
      <Field label="Stroke">
        <input
          type="color"
          value={element.strokeColor}
          onChange={(e) => onChange({ strokeColor: e.target.value })}
        />
      </Field>
      <Field label={`Stroke width — ${element.strokeWidth}px`}>
        <input
          type="range"
          min={0}
          max={24}
          value={element.strokeWidth}
          onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
        />
      </Field>
    </>
  )
}

function ImageProperties({
  element,
  onChange,
}: {
  element: ImageElement
  onChange: (patch: Record<string, any>) => void
}) {
  return (
    <>
      <Field label="Alt text">
        <input
          type="text"
          value={element.alt}
          placeholder="Describe the image"
          onChange={(e) => onChange({ alt: e.target.value })}
        />
      </Field>
      <Field label={`Opacity — ${Math.round((element.opacity ?? 1) * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={element.opacity ?? 1}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </Field>
    </>
  )
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  slide,
  element,
  onElementChange,
  onSlideChange,
  onDeleteElement,
}) => {
  if (element) {
    return (
      <div className="slides-panel-body">
        <h3>{element.type === 'text' ? 'Text' : element.type === 'shape' ? 'Shape' : 'Image'}</h3>

        {element.type === 'text' && (
          <TextProperties element={element as TextElement} onChange={onElementChange} />
        )}
        {element.type === 'shape' && (
          <ShapeProperties element={element as ShapeElement} onChange={onElementChange} />
        )}
        {element.type === 'image' && (
          <ImageProperties element={element as ImageElement} onChange={onElementChange} />
        )}

        <div className="slides-inline">
          <Field label="X">
            <input
              type="number"
              value={Math.round(element.x)}
              onChange={(e) => onElementChange({ x: Number(e.target.value) })}
            />
          </Field>
          <Field label="Y">
            <input
              type="number"
              value={Math.round(element.y)}
              onChange={(e) => onElementChange({ y: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="slides-inline">
          <Field label="Width">
            <input
              type="number"
              value={Math.round(element.width)}
              onChange={(e) => onElementChange({ width: Math.max(1, Number(e.target.value)) })}
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              value={Math.round(element.height)}
              onChange={(e) => onElementChange({ height: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
        </div>
        <Field label={`Rotation — ${Math.round(element.rotation ?? 0)}°`}>
          <input
            type="range"
            min={-180}
            max={180}
            value={element.rotation ?? 0}
            onChange={(e) => onElementChange({ rotation: Number(e.target.value) })}
          />
        </Field>

        <button type="button" className="slides-danger" onClick={onDeleteElement}>
          Delete element
        </button>
      </div>
    )
  }

  return (
    <div className="slides-panel-body">
      <h3>Slide</h3>
      <Field label="Title">
        <input
          type="text"
          value={slide?.title ?? ''}
          disabled={!slide}
          onChange={(e) => onSlideChange({ title: e.target.value })}
        />
      </Field>
      <Field label="Background">
        <input
          type="color"
          value={slide?.background?.value ?? '#ffffff'}
          disabled={!slide}
          onChange={(e) => onSlideChange({ background: { type: 'color', value: e.target.value } })}
        />
      </Field>
      <Field label="Speaker notes">
        <textarea
          rows={6}
          value={slide?.notes ?? ''}
          disabled={!slide}
          placeholder="Only you see these"
          onChange={(e) => onSlideChange({ notes: e.target.value })}
        />
      </Field>
      <p className="slides-hint">Select an element on the slide to edit it.</p>
    </div>
  )
}
