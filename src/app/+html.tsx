import { ScrollViewStyleReset } from 'expo-router/html'

// Web-only document shell. Self-hosted @font-face rules for the NCSW type system
// (Creato Display / Inter / IBM Plex Mono), served from public/fonts/*.
// Note: Inter's variable file is Inter-VariableFont_opsz,wght.ttf (optical-size axis).
const fontFaces = `
@font-face {
  font-family: 'Creato Display';
  font-weight: 800;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/creato/CreatoDisplay-ExtraBold.otf') format('opentype');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/creato/CreatoDisplay-Bold.otf') format('opentype');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/creato/CreatoDisplay-Medium.otf') format('opentype');
}
@font-face {
  font-family: 'Creato Display';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/creato/CreatoDisplay-Regular.otf') format('opentype');
}
@font-face {
  font-family: 'Inter';
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter-mono/Inter-VariableFont_opsz,wght.ttf') format('truetype');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter-mono/IBMPlexMono-Regular.ttf') format('truetype');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/inter-mono/IBMPlexMono-Medium.ttf') format('truetype');
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
      <body>{children}</body>
    </html>
  )
}
