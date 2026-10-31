# Playlist-Vorschau als Route Handler, Änderungen als Server Actions

Änderungen wie Hinzufügen, Löschen oder das Abbrechen eines Downloads laufen als Server Actions. Die Playlist-Vorschau dagegen ist ein Route Handler. Sie lädt die Playlist per yt-dlp bis zu 120 s lang und muss sich per „Cancel“ und beim Trennen des Clients abbrechen lassen. Der Browser bricht per `AbortController` ab, auf dem Server feuert `request.signal` und beendet die yt-dlp-Prozessgruppe. Server Actions können das in Next 16.4 nicht. Sie bekommen kein Abbruch-Signal, und der Client schickt sie nacheinander ab (Next-Doku, „Sequential dispatch on the client“). Eine zweite Action zum Abbrechen würde also hinter der laufenden Vorschau warten, und auch „Delete“ und „Add“ im selben Tab würden so lange hängen.

„Add“ entscheidet am Link selbst, welcher Weg gilt. Erkennt eine reine Link-Erkennung eine Playlist (bei YouTube `list` ohne `v` oder `/playlist?list=`), lädt der Route Handler die Vorschau mit „Cancel“. Alle anderen Links prüft wie bisher die Server Action von „Add“. Liefert diese Prüfung doch eine Playlist, weil die Link-Erkennung die Quelle nicht kennt (etwa ein RSS-Feed), öffnet sich der Dialog direkt mit ihrem Ergebnis. Nur dieses Laden ist dann nicht abbrechbar und endet spätestens am Timeout von 120 s.

Faustregel: Eine kurze Änderung ist eine Server Action. Lange Arbeit im Request, die abbrechbar sein muss, oder reines Laden von Daten ist ein Route Handler. Lässt sich die lange Arbeit in den Worker verschieben, wird das Abbrechen wieder eine kurze Server Action (so beim Abbruch eines Downloads).

## Considered Options

- **Nur Server Actions**: „Cancel“ würde nur den Dialog schließen. yt-dlp liefe bis zum Ende oder bis zum Timeout weiter, und der Tab hinge so lange bei weiteren Actions.
- **Zweite Action, die die Vorschau per ID abbricht**: Sie wartet wegen des sequenziellen Abschickens, bis die Vorschau fertig ist, und bricht damit nichts ab.
- **Vorschau als Hintergrund-Job mit Abfrage des Ergebnisses**: abbrechbar per kurzer Action, aber für einen einzelnen Dialog mit höchstens zwei Minuten Laufzeit deutlich mehr Aufwand.
- **Jede Link-Prüfung im Route Handler**, also ein Weg für Einzelvideos und Playlists ohne Fallunterscheidung am Link: Das wäre einheitlicher, und auch die Prüfung eines Einzelvideos wäre abbrechbar. Es kostet aber für den einfachsten Fall einen zweiten Aufruf, einen Pflicht-Zwischenspeicher und den Umbau des Formulars aus Ticket 24. Bei nur zwei Fällen überwiegt der Nutzen nicht.

## Consequences

- Der Route Handler prüft seine Eingaben selbst und braucht eine eigene Origin-Prüfung, die Server Actions eingebaut haben. Den Passwortschutz (Ticket 32) muss er genauso abdecken wie `/api/files`.
- Das Einreihen der ausgewählten Videos bleibt eine Server Action. Prüfdaten wie Titel und Dateiname darf sie nicht aus dem Browser übernehmen.
