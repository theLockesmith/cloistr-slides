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

/** A slide theme defines visual defaults applied to every new slide. */
export interface SlideTheme {
  id: string;
  name: string;
  /** Slide background. */
  background: SlideBackground;
  /** Primary text colour (applied to new text elements). */
  textColor: string;
  /** Accent colour (borders, highlights). */
  accentColor: string;
  /** Font family for body text. */
  fontFamily: string;
  /** Font family for headings (optional; falls back to fontFamily). */
  headingFontFamily?: string;
}

/** Transition applied when moving FROM this slide to the next. */
export type SlideTransition = 'none' | 'fade' | 'slide' | 'zoom';

export interface Slide {
  id: string;
  title: string;
  elements: AnySlideElement[];
  background: SlideBackground;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  /** Transition from this slide to the next. Defaults to 'none'. */
  transition?: SlideTransition;
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
  /** Active theme id. Resolved against BUILT_IN_THEMES. */
  themeId?: string;
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
