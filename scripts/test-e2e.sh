#!/bin/sh
# Baut das Runtime-Image, startet App und Fixture-Server und lässt Playwright dagegen laufen.
set -u
compose="docker compose -f compose.test.yaml ${COMPOSE_OVERRIDE:+-f $COMPOSE_OVERRIDE}"
$compose up --build --abort-on-container-exit --exit-code-from e2e
status=$?
$compose down --volumes --remove-orphans
exit $status
