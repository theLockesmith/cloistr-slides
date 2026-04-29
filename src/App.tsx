import { useState } from 'react'
import { SlideEditor } from './components/SlideEditor'
import { useNostrAuth } from '@cloistr/collab-common/auth'
import { Header, Footer, SharedAuthProvider, ToastProvider } from '@cloistr/ui/components'
import '@cloistr/ui/styles'
import type { Presentation } from './types/slide'

// Default relay for Yjs sync
const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://relay.cloistr.xyz'

/**
 * Get or generate document ID.
 * Uses URL parameter if provided, otherwise generates a new one.
 * Format: {type}-{timestamp}-{random} (e.g., slides-1711392000-a1b2c3)
 */
function getDocumentId(): string {
  const params = new URLSearchParams(window.location.search)
  const urlDocId = params.get('docId')

  if (urlDocId) {
    return urlDocId
  }

  // Generate a new document ID and update URL
  const newDocId = `slides-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const newUrl = new URL(window.location.href)
  newUrl.searchParams.set('docId', newDocId)
  window.history.replaceState({}, '', newUrl.toString())

  return newDocId
}

const INITIAL_PRESENTATION: Presentation = {
  metadata: {
    id: crypto.randomUUID(),
    title: 'New Presentation',
    description: '',
    author: '',
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

/**
 * Main content - shows login prompt or slide editor based on auth state
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()
  const [documentId] = useState(getDocumentId)
  const [presentation, setPresentation] = useState<Presentation>(INITIAL_PRESENTATION)

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header activeServiceId="slides" />

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {authState.isConnected && signer && authState.pubkey ? (
          <SlideEditor
            documentId={documentId}
            presentation={presentation}
            onPresentationChange={setPresentation}
            signer={signer}
            publicKey={authState.pubkey}
            relayUrl={DEFAULT_RELAY_URL}
          />
        ) : (
          <div className="login-prompt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <h2>Welcome to Cloistr Slides</h2>
              <p>Collaborative presentations powered by Nostr</p>
              <p>Sign in to create or edit presentations.</p>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <SharedAuthProvider>
      <AppContent />
    </SharedAuthProvider>
    </ToastProvider>
  )
}

export default App
