#!/usr/bin/env python3
"""Local static server for the web export in dist/.

Emulates Vercel's cleanUrls so client-side Expo Router sees the same paths
as production: /pdp serves dist/pdp.html, /packages serves
dist/packages/index.html (or packages.html), and unknown paths fall back to
+not-found.html. Usage: python3 scripts/dev/serve-dist.py [port] [dist-dir]
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4599
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
ROOT = os.path.abspath(ROOT)


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        if '.' not in os.path.basename(path):
            rel = path.strip('/')
            candidates = [
                os.path.join(ROOT, rel + '.html') if rel else os.path.join(ROOT, 'index.html'),
                os.path.join(ROOT, rel, 'index.html'),
            ]
            for cand in candidates:
                if os.path.isfile(cand):
                    self.path = '/' + os.path.relpath(cand, ROOT).replace(os.sep, '/')
                    break
            else:
                if os.path.isfile(os.path.join(ROOT, '+not-found.html')):
                    self.path = '/+not-found.html'
        return super().send_head()


if __name__ == '__main__':
    print(f'Serving {ROOT} with cleanUrls on http://localhost:{PORT}')
    http.server.ThreadingHTTPServer(('', PORT), CleanUrlHandler).serve_forever()
