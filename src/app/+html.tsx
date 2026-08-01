import { ScrollViewStyleReset } from 'expo-router/html'

// Web-only document shell. Self-hosted @font-face rules for the NCSW type system
// (Creato Display / Inter / IBM Plex Mono), served from public/fonts/*.woff2.
// Inter is the variable font (optical-size + weight axes). All faces are WOFF2.
const fontFaces = `
@font-face {
  font-family: 'Creato Display';
  font-weight: 800;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/CreatoDisplay-ExtraBold.woff2') format('woff2');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/CreatoDisplay-Bold.woff2') format('woff2');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/CreatoDisplay-Medium.woff2') format('woff2');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/CreatoDisplay-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/IBMPlexMono-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/IBMPlexMono-Medium.woff2') format('woff2');
}
`

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: fontFaces }} />
        <link rel="stylesheet" href="/ncsw.css" />
        <ScrollViewStyleReset />
      </head>
      <body>
        {/* Homepage data feeds — set window globals the components read.
            Loaded before the React bundle so they're available on first render. */}
        <script src="/subwoofer-frontier-data.js" defer />
        {children}
      </body>
    </html>
  )
}
