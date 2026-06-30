import { createContext } from 'react'

// When a copy primitive (Lead / Heading) lives inside a bounded container that
// already controls its own line length — like a Card.Body — the global
// copyMaxWidth (66.6%) is the wrong constraint: the card width IS the line.
// Card.Body sets this context to true; Lead and Heading skip their maxWidth
// when the context is true. Default false means the maxWidth rule still
// applies on full-width section copy.

export const FullWidthCopyContext = createContext<boolean>(false)
