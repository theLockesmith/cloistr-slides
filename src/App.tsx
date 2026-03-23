import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { SlideEditor } from './components/SlideEditor'
import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools'
import type { SignerInterface } from '@cloistr/collab-common'
import type { Event, UnsignedEvent } from 'nostr-tools'
import type { Presentation } from './types/slide'

// Auth context providing signer and relay config
interface AuthContextType {
  signer: SignerInterface
  publicKey: string
  relayUrl: string
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
  relayUrl: string
  signer: SignerInterface
  publicKey: string
}

function AuthProvider({ children, relayUrl, signer, publicKey }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ signer, publicKey, relayUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useNostrAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useNostrAuth must be used within AuthProvider')
  }
  return context
}

/**
 * Create a SignerInterface from a private key
 * In production, this would be replaced with NIP-46 or NIP-07 signer
 */
function createLocalSigner(privateKey: Uint8Array): SignerInterface {
  const pubkey = getPublicKey(privateKey)

  return {
    async getPublicKey(): Promise<string> {
      return pubkey
    },
    async signEvent(event: UnsignedEvent): Promise<Event> {
      return finalizeEvent(event, privateKey)
    },
    async encrypt(_pubkey: string, _plaintext: string): Promise<string> {
      throw new Error('Encryption not implemented for local signer')
    },
    async decrypt(_pubkey: string, _ciphertext: string): Promise<string> {
      throw new Error('Decryption not implemented for local signer')
    },
  }
}

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

function App() {
  const [authConfig, setAuthConfig] = useState<{
    relayUrl: string
    signer: SignerInterface
    publicKey: string
  } | null>(null)
  const [documentId] = useState(getDocumentId)
  const [presentation, setPresentation] = useState<Presentation>(INITIAL_PRESENTATION)

  useEffect(() => {
    // Generate a session key for demo purposes
    // In production, this would connect to coldforge-signer via NIP-46
    const privateKey = generateSecretKey()
    const publicKey = getPublicKey(privateKey)
    const signer = createLocalSigner(privateKey)

    setAuthConfig({
      relayUrl: 'wss://nos.lol', // Public relay for demo
      signer,
      publicKey
    })
  }, [])

  if (!authConfig) {
    return <div>Loading...</div>
  }

  return (
    <AuthProvider
      relayUrl={authConfig.relayUrl}
      signer={authConfig.signer}
      publicKey={authConfig.publicKey}
    >
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
              {nip19.npubEncode(authConfig.publicKey).slice(0, 20)}...
            </span>
            <button onClick={() => console.log('Share presentation')}>Share</button>
            <button onClick={() => console.log('Export presentation')}>Export</button>
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'hidden' }}>
          <SlideEditor
            documentId={documentId}
            presentation={presentation}
            onPresentationChange={setPresentation}
          />
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
