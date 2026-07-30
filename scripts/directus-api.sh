#!/usr/bin/env bash

set -euo pipefail

directus_config_path="${DIRECTUS_CONFIG_PATH:-${HOME}/.config/directus-render.env}"

if [[ ! -r "$directus_config_path" ]]; then
  echo "Directus credential file is not readable: $directus_config_path" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$directus_config_path"
set +a

for required_name in DIRECTUS_URL DIRECTUS_TOKEN; do
  if [[ -z "${!required_name:-}" ]]; then
    echo "Missing $required_name in $directus_config_path" >&2
    exit 1
  fi
done

request_method="${1:-GET}"
request_path="${2:-/users/me}"

if [[ "$request_path" != /* ]]; then
  echo "Directus path must begin with /" >&2
  exit 1
fi

shift $(( $# >= 2 ? 2 : $# ))

exec curl \
  --fail-with-body \
  --silent \
  --show-error \
  --request "$request_method" \
  --header "Authorization: Bearer $DIRECTUS_TOKEN" \
  --header "Content-Type: application/json" \
  "${DIRECTUS_URL%/}${request_path}" \
  "$@"
