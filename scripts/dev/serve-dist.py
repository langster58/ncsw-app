#!/usr/bin/env python3
"""Local static server for the web export in dist/.

Emulates the production Vercel behavior the static export depends on:
- cleanUrls: /pdp serves dist/pdp.html, /packages serves
  dist/packages/index.html; unknown paths fall back to +not-found.html.
- /directus/* proxy: forwarded to DIRECTUS_URL (read from the repo .env) so
  data-wired pages work locally exactly as deployed.
Usage: python3 scripts/dev/serve-dist.py [port] [dist-dir]
"""
import http.server
import os
import re
import sys
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4599
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
ROOT = os.path.abspath(ROOT)


def _directus_url():
    env = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
    try:
        for line in open(env):
            m = re.match(r'\s*DIRECTUS_URL\s*=\s*(\S+)', line)
            if m:
                return m.group(1).strip().strip('"\'')
    except OSError:
        pass
    return None


DIRECTUS_URL = _directus_url()


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path.startswith('/directus/') and DIRECTUS_URL:
            target = DIRECTUS_URL.rstrip('/') + self.path[len('/directus'):]
            try:
                with urllib.request.urlopen(urllib.request.Request(target, headers={'Accept': 'application/json'}), timeout=30) as r:
                    body = r.read()
                    self.send_response(r.status)
                    self.send_header('Content-Type', r.headers.get('Content-Type', 'application/json'))
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
            except Exception as e:  # surface proxy failures as 502, not silence
                msg = str(e).encode()
                self.send_response(502)
                self.send_header('Content-Length', str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            return
        super().do_GET()

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
