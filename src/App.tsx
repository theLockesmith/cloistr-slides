import { SlideEditor } from './components/SlideEditor'
import { useNostrAuth } from '@cloistr/auth'
import { getOrCreateDocumentId, getServiceConfig } from '@cloistr/collab-common/config'
import { Header, Footer, SharedAuthProvider, ToastProvider, LoginPrompt, ThemeProvider } from '@cloistr/ui/components'
import '@cloistr/ui/styles'
import { useState } from 'react'

// Service configuration from environment
const config = getServiceConfig()

/**
 * Main content - shows login prompt or slide editor based on auth state
 *
 * The presentation itself lives in the editor's Yjs document, not here. App
 * used to own a React copy and pass it down, which meant anything arriving
 * through Yjs — a loaded snapshot, a collaborator's edit — had nowhere to go.
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()
  const [documentId] = useState(() => getOrCreateDocumentId('slides'))

  return (
    <div className="slides-app">
      <Header activeServiceId="slides" />

      <main className="slides-main-region">
        {authState.isConnected && signer && authState.pubkey ? (
          <SlideEditor
            documentId={documentId}
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
    <ThemeProvider>
      <ToastProvider>
        <SharedAuthProvider>
          <AppContent />
        </SharedAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
