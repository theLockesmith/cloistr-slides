# collab-common 0.7.1 load gate in slides — requirements

Before collab-common 0.7.1, a relay that connected but never answered the
snapshot query looked like "no presentation", and slides also seeded a blank
first slide after an 8 second backstop, so the next save could replace the
real deck with a blank one. 0.7.1 reports that as `loadStatus: 'failed'`,
reports a new presentation as `loaded`, and refuses saves until loaded.

- R1 No save path (status-bar button, File menu, Ctrl+S) attempts a save
  unless `loadStatus === 'loaded'`; when blocked it says why.
- R2 A first slide is seeded only after a confirmed load, into an empty deck.
  The 8 second backstop is removed.
- R3 Until loaded, the slide editor is not rendered; a failed load shows an
  error with Retry, never the editor.
- R4 "Could not save" only reports save failures, never load failures.
- R5 Live with a throwaway account: an edit after sign-in never replaces an
  existing deck; a relay that connects but never answers shows the error.
