#!/usr/bin/env python3
"""
Directus REST API Client with auto-retry on 502/503/504 and connection pooling.
Reads credentials from ~/.config/directus-render.env.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

ENV_PATH = os.environ.get("DIRECTUS_CONFIG_PATH", os.path.expanduser("~/.config/directus-render.env"))

def load_env():
    config = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    config[k.strip()] = v.strip().strip('"').strip("'")
    return config

ENV = load_env()
BASE_URL = ENV.get("DIRECTUS_URL", "").rstrip("/")
TOKEN = ENV.get("DIRECTUS_TOKEN", "")

if not BASE_URL or not TOKEN:
    print(f"Error: DIRECTUS_URL or DIRECTUS_TOKEN missing in {ENV_PATH}", file=sys.stderr)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "Antigravity-DirectusClient/1.0"
}

def request(method, path, data=None, max_retries=5, backoff_factor=1.5):
    if not path.startswith("/"):
        path = "/" + path
    url = f"{BASE_URL}{path}"
    
    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode("utf-8")
        elif isinstance(data, str):
            body = data.encode("utf-8")
        elif isinstance(data, bytes):
            body = data

    for attempt in range(1, max_retries + 1):
        req = urllib.request.Request(url, data=body, headers=HEADERS, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = resp.read().decode("utf-8")
                if resp_body:
                    try:
                        return json.loads(resp_body)
                    except json.JSONDecodeError:
                        return {"raw": resp_body}
                return {}
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            # Retry on 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
            if e.code in (502, 503, 504) and attempt < max_retries:
                sleep_time = backoff_factor ** attempt
                print(f"[DirectusClient] HTTP {e.code} (Render spin-up). Retrying in {sleep_time:.1f}s (Attempt {attempt}/{max_retries})...", file=sys.stderr)
                time.sleep(sleep_time)
                continue
            else:
                try:
                    err_json = json.loads(err_body)
                    print(f"Directus HTTP Error {e.code}: {json.dumps(err_json, indent=2)}", file=sys.stderr)
                except Exception:
                    print(f"Directus HTTP Error {e.code}: {err_body}", file=sys.stderr)
                sys.exit(1)
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < max_retries:
                sleep_time = backoff_factor ** attempt
                print(f"[DirectusClient] Network error: {e}. Retrying in {sleep_time:.1f}s (Attempt {attempt}/{max_retries})...", file=sys.stderr)
                time.sleep(sleep_time)
                continue
            else:
                print(f"Directus Network Error: {e}", file=sys.stderr)
                sys.exit(1)

def get(path, params=None):
    if params:
        query_str = urllib.parse.urlencode(params)
        path = f"{path}{'&' if '?' in path else '?'}{query_str}"
    return request("GET", path)

def patch(path, data):
    return request("PATCH", path, data=data)

def post(path, data):
    return request("POST", path, data=data)

def delete(path):
    return request("DELETE", path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/directus_client.py <METHOD> <PATH> [--data <JSON_FILE_OR_STRING>]")
        sys.exit(1)
    
    method = sys.argv[1]
    path = sys.argv[2] if len(sys.argv) > 2 else "/users/me"
    
    data_input = None
    if "--data" in sys.argv:
        idx = sys.argv.index("--data")
        if idx + 1 < len(sys.argv):
            val = sys.argv[idx + 1]
            if val.startswith("@") and os.path.exists(val[1:]):
                with open(val[1:], "r") as f:
                    data_input = json.load(f)
            else:
                try:
                    data_input = json.loads(val)
                except Exception:
                    data_input = val

    res = request(method, path, data=data_input)
    print(json.dumps(res, indent=2))
