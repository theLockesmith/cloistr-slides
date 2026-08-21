/**
 * Logical slide dimensions (16:9). Every coordinate in a presentation is in
 * this space; the canvas backing store matches it exactly and CSS handles the
 * scaling, so zoom never has to be baked into stored geometry.
 */
export const SLIDE_WIDTH = 1600;
export const SLIDE_HEIGHT = 900;

export interface SlideElement {
  id: string;
  type: 'text' | 'shape' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
}

export interface TextElement extends SlideElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface ShapeElement extends SlideElement {
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'triangle' | 'line';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export interface ImageElement extends SlideElement {
  type: 'image';
  src: string;
  alt: string;
  opacity: number;
}

export type AnySlideElement = TextElement | ShapeElement | ImageElement;

export interface SlideBackground {
  type: 'color' | 'gradient' | 'image';
  value: string; // hex color, gradient CSS, or image URL
}

export interface Slide {
  id: string;
  title: string;
  elements: AnySlideElement[];
  background: SlideBackground;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export interface PresentationMetadata {
  id: string;
  title: string;
  description: string;
  author: string; // Nostr pubkey
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
}

export interface Presentation {
  metadata: PresentationMetadata;
  slides: Slide[];
  selectedSlideId?: string;
  collaborators: string[]; // Nostr pubkeys
}

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  selectedElementIds: string[];
  isPresenting: boolean;
}

// SlideTheme is planned for a future themes feature (colour palette + font
// pairing). It is not yet implemented in the editor or renderer. Define it
// here when the theme picker and metadataMap wiring are added together so
// there is no dead type living in the codebase in the meantime.