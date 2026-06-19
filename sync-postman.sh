#!/bin/sh
# Syncs postman.json to Postman cloud collection
# Requires POSTMAN_API_KEY to be set in .env or environment

# Load from .env if it exists
if [ -f "$(dirname "$0")/.env" ]; then
  export $(grep -E '^POSTMAN_API_KEY=' "$(dirname "$0")/.env" | xargs)
fi

if [ -z "$POSTMAN_API_KEY" ]; then
  echo "⚠️  Postman sync skipped: POSTMAN_API_KEY not set"
  exit 0
fi

COLLECTION_UID="51691801-ddbdb8bc-4305-453b-9e5f-32982304f9e5"
POSTMAN_JSON="$(dirname "$0")/postman.json"

if [ ! -f "$POSTMAN_JSON" ]; then
  echo "⚠️  Postman sync skipped: postman.json not found"
  exit 0
fi

echo "Syncing postman.json to Postman cloud..."

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "https://api.getpostman.com/collections/$COLLECTION_UID" \
  -H "X-Api-Key: $POSTMAN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"collection\": $(cat "$POSTMAN_JSON")}")

if [ "$RESPONSE" = "200" ]; then
  echo "Postman collection synced successfully"
else
  echo "⚠️  Postman sync failed (HTTP $RESPONSE)"
fi
