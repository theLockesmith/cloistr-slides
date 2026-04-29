import { useState } from 'react'
import { SlideEditor } from './components/SlideEditor'
import { useNostrAuth } from '@cloistr/collab-common/auth'
import { getOrCreateDocumentId, getServiceConfig } from '@cloistr/collab-common/config'
import { Header, Footer, SharedAuthProvider, ToastProvider, LoginPrompt } from '@cloistr/ui/components'
import '@cloistr/ui/styles'
import type { Presentation } from './types/slide'

// Service configuration from environment
const config = getServiceConfig()

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
  const [documentId] = useState(() => getOrCreateDocumentId('slides'))
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
            relayUrl={config.relayUrl}
          />
        ) : (
          <LoginPrompt
            title="Cloistr Slides"
            subtitle="Collaborative presentations powered by Nostr"
            callToAction="Sign in to create or edit presentations."
          />
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
