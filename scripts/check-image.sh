#!/bin/sh
# Prüft das Runtime-Image: HEALTHCHECK wird healthy, Prozess läuft als UID 1000,
# kein sharp/@img im standalone-Output, better-sqlite3 wird von dort geladen.
set -eu
image=${1:?usage: check-image.sh <image>}

fail() { echo "FAIL: $*" >&2; exit 1; }

cid=$(docker run -d --init --tmpfs /data:uid=1000,gid=1000 "$image")
trap 'docker rm -f "$cid" >/dev/null' EXIT

status=starting
for _ in $(seq 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$cid")
  [ "$status" = healthy ] && break
  [ "$status" = unhealthy ] && break
  sleep 1
done
[ "$status" = healthy ] || { docker logs "$cid" >&2; fail "container is $status, not healthy"; }

uid=$(docker exec "$cid" id -u)
[ "$uid" = 1000 ] || fail "container runs as UID $uid, not 1000"

docker exec "$cid" sh -c '! test -e node_modules/sharp && ! test -e node_modules/@img' \
  || fail "standalone output contains sharp or @img"

# register hat die DB beim Start geöffnet, das Addon ist also schon geladen.
docker exec "$cid" sh -c 'grep -qs "/app/node_modules/better-sqlite3/prebuilds/" /proc/[0-9]*/maps' \
  || fail "better-sqlite3 is not loaded from the standalone output"

echo "image checks passed: healthy, UID 1000, no sharp, better-sqlite3 from standalone output"
