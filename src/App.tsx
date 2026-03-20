import { useState } from 'react'
// TODO: Import AuthProvider from cloistr-collab-common once it's implemented
// import { AuthProvider } from 'cloistr-collab-common'

// Placeholder AuthProvider component
const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>
}
import { SlideEditor } from './components/SlideEditor'
import type { Presentation } from './types/slide'

const INITIAL_PRESENTATION: Presentation = {
  metadata: {
    id: crypto.randomUUID(),
    title: 'New Presentation',
    description: '',
    author: '', // Will be set by auth
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    tags: [],
  },
  slides: [
    {
      id: crypto.randomUUID(),
      title: 'Slide 1',
      elements: [],
      background: {
        type: 'color',
        value: '#ffffff',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  collaborators: [],
}

function App() {
  const [presentation, setPresentation] = useState<Presentation>(INITIAL_PRESENTATION)

  return (
    <AuthProvider>
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          padding: '1rem',
          borderBottom: '1px solid #ccc',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
            {presentation.metadata.title} - Cloistr Slides
          </h1>
          <div>
            <button onClick={() => console.log('Share presentation')}>Share</button>
            <button onClick={() => console.log('Export presentation')}>Export</button>
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'hidden' }}>
          <SlideEditor
            presentation={presentation}
            onPresentationChange={setPresentation}
          />
        </main>
      </div>
    </AuthProvider>
  )
}

export default App