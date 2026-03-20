# CLAUDE.md - Cloistr Slides

**Collaborative presentation editor - Google Slides alternative for Cloistr**

## Project Information

- **Type:** React TypeScript Application
- **Purpose:** Collaborative presentation editor using Yjs for real-time collaboration
- **Technology Stack:** React 18, TypeScript, Vite, Yjs, Canvas/SVG-based slide editor
- **Company:** Coldforge (Cloistr product)

## Architecture

### Custom Slide Editor

This project implements a **custom canvas/SVG-based slide editor** because no mature Yjs-compatible presentation libraries exist. The editor provides:

- **Canvas-based rendering** for performance and flexibility
- **Custom element types**: text, shapes, images
- **Real-time collaboration** via Yjs shared documents
- **Zoom/pan/selection** capabilities
- **Multi-slide presentations** with thumbnail navigation

### Yjs Integration

```typescript
// Yjs document structure
const ydoc = new Y.Doc()
const yslides = ydoc.getMap<Y.Map<any>>('slides')     // All slides
const ymetadata = ydoc.getMap('metadata')             // Presentation metadata

// Each slide stored as Y.Map with:
// - id: string
// - title: string
// - elements: Y.Array<SlideElement>
// - background: SlideBackground
// - notes: string
```

### Component Structure

```
src/
├── components/
│   └── SlideEditor.tsx          # Main editor component
├── types/
│   └── slide.ts                 # TypeScript definitions
├── App.tsx                      # App wrapper with AuthProvider
└── main.tsx                     # React entrypoint
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `yjs` | Real-time collaborative editing |
| `nostr-tools` | Nostr protocol integration |
| `cloistr-collab-common` | Shared collaboration utilities |
| `react` + `react-dom` | UI framework |
| `vite` | Build tool and dev server |
| `typescript` | Type safety |

## Slide Data Model

### Core Types

- **SlideElement**: Base interface for all slide elements
  - Text elements with fonts, colors, alignment
  - Shape elements (rectangle, circle, triangle, line)
  - Image elements with opacity control
- **Slide**: Container with elements, background, notes
- **Presentation**: Metadata + array of slides + collaborators

### Canvas Rendering

The editor uses HTML5 Canvas for:
- **Performance**: Direct pixel manipulation
- **Flexibility**: Custom drawing logic for complex elements
- **Collaboration**: Easy to sync element positions/properties

### Element Selection & Manipulation

- Click to select elements
- Visual selection indicators (blue borders)
- Properties panel for editing selected elements
- Drag to move elements (placeholder implementation)

## Development Status

### Implemented

- ✅ Project scaffold with TypeScript + Vite
- ✅ Basic slide editor UI layout
- ✅ Canvas-based rendering system
- ✅ Yjs document structure
- ✅ Slide navigation and creation
- ✅ Basic element types (text, shape, image)
- ✅ Properties panel for slide/element editing

### TODO

- 🔲 **Yjs collaboration sync** - Properly sync Yjs changes to React state
- 🔲 **Element manipulation** - Drag, resize, rotate elements
- 🔲 **Advanced text editing** - Rich text, inline editing
- 🔲 **Shape drawing tools** - Vector shape creation
- 🔲 **Image upload/management** - Blossom integration for files
- 🔲 **Presentation mode** - Fullscreen slide viewer
- 🔲 **Export functionality** - PDF, images, Nostr events
- 🔲 **Nostr integration** - Publish presentations as events
- 🔲 **Real-time cursors** - Show collaborator cursors
- 🔲 **Undo/redo** - History management
- 🔲 **Themes/templates** - Predefined slide designs

## Why Custom Implementation?

**No existing Yjs-compatible presentation libraries** provide the level of control and real-time collaboration needed. Existing solutions:

- **Reveal.js**: Markdown-based, no real-time collaboration
- **Impress.js**: CSS transforms, no collaborative editing
- **Google Slides API**: Requires Google infrastructure
- **Figma/Miro**: Closed source, expensive APIs

Our custom implementation provides:
- **Full control** over collaboration model
- **Nostr-native** integration possibilities
- **Self-hostable** without external dependencies
- **AGPL license** aligned with Cloistr philosophy

## Integration Points

### Cloistr Ecosystem

- **Identity**: NIP-46 authentication via cloistr-collab-common
- **Files**: Blossom file storage for images/assets
- **Relay**: Publish presentations as Nostr events
- **Discovery**: Share presentations in Cloistr network

### Collaboration Features

- **Real-time editing** via Yjs operational transformation
- **Conflict resolution** automatic via Yjs CRDT
- **Offline support** with sync when reconnected
- **Permission model** via Nostr pubkey authorization

---

**Last Updated:** 2026-03-20

**Next Priority:** Implement proper Yjs ↔ React state synchronization for real-time collaboration.