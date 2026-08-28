#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "${LINE_CHANNEL_ACCESS_TOKEN:-}" ]]; then
  echo "error: LINE_CHANNEL_ACCESS_TOKEN is required" >&2
  exit 1
fi

RICHMENU_IMAGE="${RICHMENU_IMAGE:-${SCRIPT_DIR}/line-richmenu.png}"
WEB_URL="${WEB_URL:-https://hmbt.ast24.dev/home}"
CHAT_BAR_TEXT="${CHAT_BAR_TEXT:-Menu}"
LINE_RICHMENU_ALIAS_ID="${LINE_RICHMENU_ALIAS_ID:-}"
CLEANUP_EXISTING_RICHMENUS="${CLEANUP_EXISTING_RICHMENUS:-1}"

if [[ ! -f "${RICHMENU_IMAGE}" ]]; then
  echo "error: rich menu image not found: ${RICHMENU_IMAGE}" >&2
  echo "hint : place a PNG file next to this script, e.g. ${SCRIPT_DIR}/line-richmenu.png" >&2
  exit 1
fi

create_payload="$(cat <<JSON
{
  "size": {
    "width": 2500,
    "height": 1686
  },
  "selected": true,
  "name": "hmbt-v5-line-main",
  "chatBarText": "${CHAT_BAR_TEXT}",
  "areas": [
    {
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 834,
        "height": 843
      },
      "action": {
        "type": "postback",
        "data": "action=schedule_week",
        "inputOption": "closeRichMenu"
      }
    },
    {
      "bounds": {
        "x": 0,
        "y": 843,
        "width": 834,
        "height": 843
      },
      "action": {
        "type": "postback",
        "data": "action=personal_timetable",
        "inputOption": "closeRichMenu"
      }
    },
    {
      "bounds": {
        "x": 834,
        "y": 0,
        "width": 833,
        "height": 843
      },
      "action": {
        "type": "postback",
        "data": "action=next_train",
        "inputOption": "closeRichMenu"
      }
    },
    {
      "bounds": {
        "x": 834,
        "y": 843,
        "width": 833,
        "height": 843
      },
      "action": {
        "type": "uri",
        "uri": "${WEB_URL}"
      }
    }
    ,
    {
      "bounds": {
        "x": 1667,
        "y": 0,
        "width": 833,
        "height": 843
      },
      "action": {
        "type": "postback",
        "data": "action=menu",
        "inputOption": "closeRichMenu"
      }
    },
    {
      "bounds": {
        "x": 1667,
        "y": 843,
        "width": 833,
        "height": 843
      },
      "action": {
        "type": "uri",
        "uri": "${WEB_URL}"
      }
    }
  ]
}
JSON
)"

auth_header="Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}"

line_api_request() {
  local method="$1"
  local url="$2"
  local content_type="${3:-}"
  local payload="${4:-}"
  local payload_file="${5:-}"
  local body_file
  local http_code
  local body

  body_file="$(mktemp)"

  if [[ -n "${payload_file}" ]]; then
    http_code="$(curl -sS -X "${method}" "${url}" \
      -H "${auth_header}" \
      -H "Content-Type: ${content_type}" \
      --data-binary "@${payload_file}" \
      -o "${body_file}" \
      -w "%{http_code}")"
  elif [[ -n "${payload}" ]]; then
    http_code="$(curl -sS -X "${method}" "${url}" \
      -H "${auth_header}" \
      -H "Content-Type: ${content_type}" \
      --data "${payload}" \
      -o "${body_file}" \
      -w "%{http_code}")"
  else
    http_code="$(curl -sS -X "${method}" "${url}" \
      -H "${auth_header}" \
      -o "${body_file}" \
      -w "%{http_code}")"
  fi

  body="$(cat "${body_file}")"
  rm -f "${body_file}"

  if [[ ! "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
    echo "error: LINE API request failed (${method} ${url}) status=${http_code}" >&2
    if [[ -n "${body}" ]]; then
      echo "response: ${body}" >&2
    fi
    return 1
  fi

  printf '%s' "${body}"
}

resolve_default_richmenu_id() {
  local response
  response="$(line_api_request \
    "GET" \
    "https://api.line.me/v2/bot/user/all/richmenu")"

  printf '%s' "${response}" | sed -n 's/.*"richMenuId":"\([^"]*\)".*/\1/p'
}

extract_json_values() {
  local key="$1"
  local json="$2"

  printf '%s' "${json}" \
    | grep -oE "\"${key}\":\"[^\"]+\"" \
    | sed -E "s/^\"${key}\":\"([^\"]+)\"$/\1/" \
    | sort -u || true
}

cleanup_existing_richmenus() {
  local alias_list_response
  local richmenu_list_response
  local alias_id
  local richmenu_id

  alias_list_response="$(line_api_request \
    "GET" \
    "https://api.line.me/v2/bot/richmenu/alias/list")"

  while IFS= read -r alias_id; do
    [[ -z "${alias_id}" ]] && continue
    line_api_request \
      "DELETE" \
      "https://api.line.me/v2/bot/richmenu/alias/${alias_id}" >/dev/null
  done < <(extract_json_values "richMenuAliasId" "${alias_list_response}")

  richmenu_list_response="$(line_api_request \
    "GET" \
    "https://api.line.me/v2/bot/richmenu/list")"

  while IFS= read -r richmenu_id; do
    [[ -z "${richmenu_id}" ]] && continue
    line_api_request \
      "DELETE" \
      "https://api.line.me/v2/bot/richmenu/${richmenu_id}" >/dev/null
  done < <(extract_json_values "richMenuId" "${richmenu_list_response}")
}

if [[ "${CLEANUP_EXISTING_RICHMENUS}" == "1" ]]; then
  echo "info: cleaning existing rich menus and aliases"
  cleanup_existing_richmenus
fi

create_response="$(line_api_request \
  "POST" \
  "https://api.line.me/v2/bot/richmenu" \
  "application/json" \
  "${create_payload}")"

richmenu_id="$(printf '%s' "${create_response}" | sed -n 's/.*"richMenuId":"\([^"]*\)".*/\1/p')"
if [[ -z "${richmenu_id}" ]]; then
  echo "error: failed to create rich menu" >&2
  echo "response: ${create_response}" >&2
  exit 1
fi

line_api_request \
  "POST" \
  "https://api-data.line.me/v2/bot/richmenu/${richmenu_id}/content" \
  "image/png" \
  "" \
  "${RICHMENU_IMAGE}" >/dev/null

line_api_request \
  "POST" \
  "https://api.line.me/v2/bot/user/all/richmenu/${richmenu_id}" >/dev/null

default_richmenu_id="$(resolve_default_richmenu_id)"
if [[ -z "${default_richmenu_id}" ]]; then
  echo "error: failed to confirm default rich menu" >&2
  exit 1
fi

if [[ "${default_richmenu_id}" != "${richmenu_id}" ]]; then
  echo "error: default rich menu mismatch" >&2
  echo "expected: ${richmenu_id}" >&2
  echo "actual  : ${default_richmenu_id}" >&2
  exit 1
fi

if [[ -n "${LINE_RICHMENU_ALIAS_ID}" ]]; then
  alias_list_response="$(line_api_request \
    "GET" \
    "https://api.line.me/v2/bot/richmenu/alias/list")"

  if [[ "${alias_list_response}" == *"\"richMenuAliasId\":\"${LINE_RICHMENU_ALIAS_ID}\""* ]]; then
    line_api_request \
      "DELETE" \
      "https://api.line.me/v2/bot/richmenu/alias/${LINE_RICHMENU_ALIAS_ID}" >/dev/null
  fi

  alias_payload="$(cat <<JSON
{
  "richMenuAliasId": "${LINE_RICHMENU_ALIAS_ID}",
  "richMenuId": "${richmenu_id}"
}
JSON
)"

  line_api_request \
    "POST" \
    "https://api.line.me/v2/bot/richmenu/alias" \
    "application/json" \
    "${alias_payload}" >/dev/null
fi

echo "done: rich menu configured"
echo "richMenuId=${richmenu_id}"
echo "defaultRichMenuId=${default_richmenu_id}"
if [[ -n "${LINE_RICHMENU_ALIAS_ID}" ]]; then
  echo "alias=${LINE_RICHMENU_ALIAS_ID}"
fi
