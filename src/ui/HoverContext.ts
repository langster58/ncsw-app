import { createContext } from 'react'

// HoverContext lets an interactive *surface* (like a clickable Card) publish
// its hover state to descendants. Inner affordances (like a door-style Link
// inside the card's footer) can OR this signal with their own hover state so
// they shift to their hovered appearance when the surface is hovered — even
// though the cursor isn't directly on them.
//
// Default false: components that don't have an interactive ancestor see no
// inherited hover and behave normally.

export const HoverContext = createContext<boolean>(false)
