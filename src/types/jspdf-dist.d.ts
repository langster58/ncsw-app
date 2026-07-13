// jspdf's browser ES build, imported by path to dodge the package's "node"
// export condition (an AMD build Metro cannot parse). Same API as the root.
declare module 'jspdf/dist/jspdf.es.min.js' {
  export * from 'jspdf'
}
