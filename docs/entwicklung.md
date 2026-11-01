# Entwicklung mit Docker

Alle Befehle laufen im Wurzelverzeichnis des Repos. Die CI (`.github/workflows/ci.yml`) nutzt dieselben Befehle.

## Images

Das `Dockerfile` hat vier Stufen:

| Stufe | Inhalt | Wofür |
|---|---|---|
| `base` | Node, ffmpeg, yt-dlp (Standalone-Binary, Prüfsumme geprüft) | Fixture-Server der Tests |
| `dev` | `base` plus `npm ci` und der Quellcode | `next dev`, Integrationstests |
| `build` | `dev` plus `npm run build` | nur Zwischenstufe |
| `runtime` | `base` plus der Standalone-Output aus `build` | Produktion, Container- und E2E-Tests |

Die Architektur (amd64 oder arm64) wählt Docker selbst. Build-Argumente: `NODE_MAJOR` (Standard 26) und `YTDLP_VERSION` (Standard steht im `Dockerfile`). Wer `YTDLP_VERSION` ändert, muss auch die gepinnte Version in `test/container/image.test.ts` anpassen.

```sh
# Produktions-Image bauen und starten, App unter http://localhost:3000
docker build --target runtime -t videoloader .
docker run --rm --init -p 3000:3000 -v videoloader-data:/data videoloader

# Dev-Image bauen (enthält den Quellcode, nach Änderungen neu bauen)
docker build --target dev -t videoloader:dev .
```

## Entwickeln im Container

`compose.dev.yaml` startet `next dev` mit Hot Reload. Der Quellcode kommt per Bind-Mount, die Binaries (yt-dlp, ffmpeg) sind dieselben wie in Produktion.

```sh
docker compose -f compose.dev.yaml up --build
docker compose -f compose.dev.yaml down       # Volumes bleiben (node_modules, Daten)
docker compose -f compose.dev.yaml down -v    # Volumes mit löschen
```

Kommen Änderungen über den Bind-Mount nicht an, in `compose.dev.yaml` `WATCHPACK_POLLING: "true"` einkommentieren.

## Tests

| Suite | Befehl | Braucht |
|---|---|---|
| Lint, Typecheck, Unit | `npm run lint`, `npm run typecheck`, `npm test` | Node 26 und `npm ci` auf dem Host |
| Integration | `docker run --rm videoloader:dev npm run test:integration` | Dev-Image |
| Container | `npm run test:container` | Runtime-Image aus der Test-Compose, Node auf dem Host |
| E2E | `npm run test:e2e` | Docker |

**Integration** braucht yt-dlp und ffmpeg und läuft deshalb im Dev-Image. Weil das Image den Quellcode enthält, nach jeder Änderung neu bauen. Schneller geht es, wenn man den aktuellen Stand einhängt:

```sh
docker run --rm \
  -v "$PWD/src:/app/src:ro" -v "$PWD/test:/app/test" -v "$PWD/drizzle:/app/drizzle:ro" \
  videoloader:dev npm run test:integration
```

**Container** prüft das Runtime-Image (yt-dlp-Version, ffmpeg, kein Python, Abbruch bei falscher Konfiguration, Healthcheck, UID 1000). Das Image heißt `videoloader-test-videoloader` und entsteht mit der Test-Compose. Ein anderes Image lässt sich mit `IMAGE=<tag>` prüfen.

```sh
docker compose -f compose.test.yaml build
npm run test:container
```

**E2E** (`scripts/test-e2e.sh`) baut über `compose.test.yaml` das Runtime-Image, den Fixture-Server und den Playwright-Container, lässt Playwright laufen und räumt danach mit `down --volumes` auf. Ergebnisse und Traces landen in `test-results/`. Eine zusätzliche Compose-Datei, etwa um geänderte Specs einzuhängen, ohne den Playwright-Container neu zu bauen, kommt per `COMPOSE_OVERRIDE=<datei>` dazu.

```sh
npm run test:e2e
```

Die Playwright-Version in `e2e/Dockerfile` muss zu `@playwright/test` in `package.json` passen.

## Aufräumen

Die Images sind groß, allein das Playwright-Image hat rund 3,6 GB. Ist die Platte voll, scheitern Downloads mit `Could not create temporary directory`, und die E2E-Tests schlagen fehl.

```sh
docker compose -f compose.test.yaml down -v --remove-orphans   # nach abgebrochenen E2E-Läufen
docker builder prune -af                                      # Build-Cache
docker rmi videoloader videoloader:dev                        # eigene Images
docker system df                                              # Überblick über den Platz
```
