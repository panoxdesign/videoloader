# Queue-Worker im Next-Prozess, Kommunikation nur über SQLite

Der Queue-Worker läuft im selben Node-Prozess wie die Next.js-App. Er wird aus `instrumentation.ts` (`register`) angestoßen und nicht abgewartet. Mit der Web-App spricht er ausschließlich über die SQLite-DB: Der Worker pollt etwa jede Sekunde nach neuen Einträgen und Abbruch-Flags, und der SSE-Handler liest den Fortschritt aus der DB. So bleibt es bei einem Container mit einem Prozess und `output: "standalone"`, ohne Supervisor, zweiten Build oder SQLite-Zugriff aus mehreren Prozessen. Ein In-Memory-Kanal ist bewusst ausgeschlossen: Ein Spike hat gezeigt, dass Route Handler und Server Actions das Modul-Singleton aus der Instrumentation nie sehen. `globalThis` wird zwar geteilt, das ist aber undokumentiertes Verhalten, und die Sekunde Latenz fällt in dieser UI nicht auf.

## Considered Options

- **Custom Server**: lässt sich laut Next-Doku nicht mit `standalone` kombinieren und wird dort generell nicht empfohlen.
- **Eigener Worker-Prozess**: kostet einen Supervisor, einen eigenen Build und SQLite-Zugriff aus mehreren Prozessen. Er bleibt die Rückfalloption. Weil schon jetzt nur über die DB kommuniziert wird, lässt sich der Worker ohne Protokolländerung herauslösen.

## Consequences

- Next fängt SIGTERM ab und beendet den Prozess ohne sauberes Aufräumen. Deshalb gilt Start-Aufräumen als Pflicht: Verwaiste Einträge auf „läuft" werden zurückgesetzt und noch lebende yt-dlp-Prozessgruppen nach PID-Prüfung über `/proc` beendet.
- Code auf Modulebene darf keine Seiteneffekte haben, weil `next build` ihn ausführt.
- Details: `.scratch/video-downloader/issues/05-architektur-festlegen.md`, `.scratch/video-downloader/assets/worker-lebenszyklus.md`, `.scratch/video-downloader/assets/spike-singleton.md`.
