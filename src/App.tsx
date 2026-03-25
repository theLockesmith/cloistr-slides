import { useState } from 'react'
import { SlideEditor } from './components/SlideEditor'
import { nip19 } from 'nostr-tools'
import {
  AuthProvider,
  useNostrAuth,
  useAuthHelpers,
  isValidBunkerUrl,
} from '@cloistr/collab-common/auth'
import type { Presentation } from './types/slide'

// Default relay for Yjs sync
const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://relay.cloistr.xyz'
// Default bunker URL for NIP-46
const DEFAULT_BUNKER_URL = import.meta.env.VITE_BUNKER_URL || ''

function getDocumentId(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('docId') || 'demo-slides'
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
 * Login component - shown when user is not authenticated
 */
function LoginScreen() {
  const { connectNip07, connectNip46, authState } = useNostrAuth()
  const { isNip07Available, isNip46Available, isAuthAvailable } = useAuthHelpers()
  const [bunkerUrl, setBunkerUrl] = useState(DEFAULT_BUNKER_URL)
  const [loading, setLoading] = useState(false)

  const handleNip07Connect = async () => {
    setLoading(true)
    try {
      await connectNip07()
    } catch (error) {
      console.error('NIP-07 connection failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleNip46Connect = async () => {
    if (!bunkerUrl || !isValidBunkerUrl(bunkerUrl)) {
      alert('Please enter a valid bunker URL (bunker://...)')
      return
    }
    setLoading(true)
    try {
      await connectNip46({ bunkerUrl, timeout: 30000 })
    } catch (error) {
      console.error('NIP-46 connection failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f5f5f5' }}>
      <div className="login-container" style={{ padding: '2rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', maxWidth: '400px', width: '100%' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Cloistr Slides</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>Collaborative presentations powered by Nostr</p>

        {authState.error && (
          <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#fef2f2', borderRadius: '4px' }}>{authState.error}</div>
        )}

        {!isAuthAvailable ? (
          <div>
            <p>No authentication methods available.</p>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>Install a Nostr browser extension (NIP-07) or use a remote signer (NIP-46).</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {isNip07Available && (
              <button
                onClick={handleNip07Connect}
                disabled={loading || authState.isConnecting}
                style={{ padding: '0.75rem 1rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
              >
                {loading ? 'Connecting...' : 'Connect with Extension'}
              </button>
            )}

            {isNip46Available && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="bunker://pubkey?relay=wss://..."
                  value={bunkerUrl}
                  onChange={(e) => setBunkerUrl(e.target.value)}
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
                <button
                  onClick={handleNip46Connect}
                  disabled={loading || authState.isConnecting || !bunkerUrl}
                  style={{ padding: '0.75rem 1rem', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
                >
                  {loading ? 'Connecting...' : 'Connect with Remote Signer'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Main editor view - shown when authenticated
 */
function SlidesView() {
  const { authState, signer, disconnect } = useNostrAuth()
  const [documentId] = useState(getDocumentId)
  const [presentation, setPresentation] = useState<Presentation>(INITIAL_PRESENTATION)

  if (!signer || !authState.pubkey) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '0.5rem 1rem',
        borderBottom: '1px solid #ccc',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
          {presentation.metadata.title} - Cloistr Slides
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#666' }}>
            {nip19.npubEncode(authState.pubkey).slice(0, 20)}... ({authState.method})
          </span>
          <button onClick={() => console.log('Share presentation')}>Share</button>
          <button onClick={() => console.log('Export presentation')}>Export</button>
          <button onClick={disconnect} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
            Disconnect
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>
        <SlideEditor
          documentId={documentId}
          presentation={presentation}
          onPresentationChange={setPresentation}
          signer={signer}
          publicKey={authState.pubkey}
          relayUrl={DEFAULT_RELAY_URL}
        />
      </main>
    </div>
  )
}

/**
 * Root component with auth routing
 */
function AppContent() {
  const { authState, signer } = useNostrAuth()

  if (authState.isConnected && signer) {
    return <SlidesView />
  }

  return <LoginScreen />
}

function App() {
  return (
    <AuthProvider autoRestore={true}>
      <AppContent />
    </AuthProvider>
  )
}

export default App
