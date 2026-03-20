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

export interface SlideTheme {
  name: string;
  fonts: {
    heading: string;
    body: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
}