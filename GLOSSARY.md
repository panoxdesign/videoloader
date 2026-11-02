# Video-Downloader

Eine selbst gehostete Web-App, in der man Links zu Videos oder Playlists einreiht und als Video- oder Audiodatei herunterladen lässt. YouTube ist die erste Quelle, weitere (z. B. X/Twitter) sollen ohne Umbau der Begriffe folgen können.

## Language

**Quelle**:
Die Plattform, von der ein Medium stammt (z. B. YouTube, später X).
_Avoid_: Provider, Site, Plattform

**Queue**:
Die Warteschlange aller Queue-Einträge, die nacheinander abgearbeitet werden.
_Avoid_: Warteliste, Download-Liste

**Queue-Eintrag**:
Ein einzelnes Medium aus einer Quelle, das mit einer gewählten Medienart heruntergeladen werden soll.
_Avoid_: Job, Task, Auftrag

**Position**:
Der Rang eines wartenden Queue-Eintrags in der Queue. „Erneut versuchen" setzt ihn ans Ende, ein Rate-Limit oder ein Neustart lässt ihn unverändert.
_Avoid_: Platz, Reihenfolge, Index

**Pause**:
Der vom Nutzer gesetzte Zustand der Queue, in dem keine Queue-Einträge starten. Laufende Queue-Einträge laden zu Ende.
_Avoid_: Stopp, Anhalten

**Medienart**:
Die Wahl pro Queue-Eintrag, ob das Medium als Video oder nur als Audio (MP3) heruntergeladen wird.
_Avoid_: Format, Typ, Modus

**Playlist**:
Eine Sammlung von Medien einer Quelle, die per Link angegeben wird und in einzelne Queue-Einträge aufgeteilt wird.
_Avoid_: Liste, Kanal

**Playlist-Vorschau**:
Die Medien einer Playlist, wie sie die Prüfung geliefert hat, aus denen man vor dem Einreihen auswählt. Sie gilt 15 Minuten und lässt sich genau einmal einreihen.
_Avoid_: Auswahl, Playlist-Liste

**Gemischter Link**:
Ein Link auf ein einzelnes Medium, der zusätzlich eine Playlist nennt, bei YouTube `watch?v=X&list=Y` oder `youtu.be/X?list=Y`. „Add“ fragt erst, ob nur das Medium oder die ganze Playlist gemeint ist. Ein Link mit Mix zählt nicht dazu.
_Avoid_: Playlist-Link (meint die reine Playlist)

**Mix**:
Eine Liste, die YouTube zu einem Medium erzeugt (`list` beginnt mit `RD`). Sie ist bei jedem Aufruf anders und enthält Wiederholungen. Die App behandelt sie nicht als Playlist: Ein Link auf den ganzen Mix (ohne Video) lehnt „Add“ ab, ein Video aus einem Mix wird als Einzelvideo eingereiht. Alben auf YouTube Music (`RDCLAK…`) sind zwar feste Listen, fallen aber unter dieselbe Regel und werden nicht unterstützt.
_Avoid_: Radio, Automix

**Livestream**:
Ein Medium, das gerade läuft, angekündigt ist oder eben erst endete, laut yt-dlp `live_status` `is_live`, `is_upcoming` oder `post_live`. „Add“ lehnt es ab, in der Playlist-Vorschau ist es gesperrt. Die Aufzeichnung eines beendeten Streams (`was_live`) ist ein normales Medium.
_Avoid_: Stream (allein, mehrdeutig mit Video- und Audiospur)

**Mediendatei**:
Die fertige heruntergeladene Datei eines Queue-Eintrags, die auf dem Server liegt und über die App abrufbar ist. Jede Mediendatei gehört zu genau einem Queue-Eintrag.
_Avoid_: Download, Output

**Duplikat**:
Ein neuer Queue-Eintrag für dasselbe Medium mit derselben Medienart wie ein wartender oder laufender Queue-Eintrag oder eine vorhandene Mediendatei, unabhängig von der Auflösung. Dasselbe Medium heißt: gleiche Quelle und gleiche Medien-ID, nicht gleicher Link.
_Avoid_: Doppelter Download, Kopie

**Aufbewahrungsfrist**:
Die Zeitspanne, nach der ein Queue-Eintrag automatisch gelöscht wird: ein fertiger samt Mediendatei ab Fertigstellung, ein fehlgeschlagener oder abgebrochener ab Fehlschlag bzw. Abbruch.
_Avoid_: TTL, Retention, Ablaufzeit

**Startabstand**:
Die Mindestzeit zwischen zwei Starts von Queue-Einträgen derselben Quelle, damit die Quelle nicht zu viele Anfragen auf einmal bekommt.
_Avoid_: Pause, Sleep, Wartezeit

**Abkühlphase**:
Der Zeitraum, in dem nach einem Rate-Limit einer Quelle keine Queue-Einträge dieser Quelle starten. Sie ist unabhängig davon, ob die Queue pausiert ist.
_Avoid_: Cooldown, Sperre, Pause

### Zustände eines Queue-Eintrags

**Wartend**:
Der Queue-Eintrag steht in der Queue und startet, sobald er an der Reihe ist und seine Quelle starten darf.
_Avoid_: Eingereiht, Pending, Pausiert

**Läuft**:
Der Queue-Eintrag wird gerade heruntergeladen oder nachbearbeitet.
_Avoid_: Aktiv, In Arbeit

**Fertig**:
Der Queue-Eintrag hat eine Mediendatei erzeugt.
_Avoid_: Abgeschlossen, Erledigt

**Fehlgeschlagen**:
Der Download des Queue-Eintrags ist an einem Fehler gescheitert. Ein Rate-Limit zählt nicht dazu.
_Avoid_: Fehler, Kaputt

**Fehlerkategorie**:
Der Grund, an dem ein fehlgeschlagener Queue-Eintrag gescheitert ist, etwa „privat“, „nicht verfügbar“ oder „Netzwerkfehler“. Die App ordnet ihn der ersten `ERROR:`-Zeile von yt-dlp zu. Zu jeder Fehlerkategorie gehört eine Kurzmeldung.
_Avoid_: Fehlercode, Fehlertyp

**Kurzmeldung**:
Der eine Satz, mit dem die Liste einem Nutzer sagt, warum ein Queue-Eintrag fehlgeschlagen ist. Sie folgt aus der Fehlerkategorie.
_Avoid_: Fehlermeldung, Error-Message

**Rohlog**:
Die letzten 64 KB der Ausgabe von yt-dlp zu einem fehlgeschlagenen Queue-Eintrag, ohne Fortschrittszeilen. Der Nutzer sieht ihn unter „Show details“.
_Avoid_: Log, Debug-Ausgabe

**Abgebrochen**:
Der Nutzer hat den laufenden Queue-Eintrag gestoppt. Er bleibt ohne Mediendatei in der Queue stehen, anders als ein entfernter Queue-Eintrag, der ganz verschwindet.
_Avoid_: Storniert, Gecancelt, Entfernt

**Abbruch-Flag**:
Die Markierung an einem laufenden Queue-Eintrag, dass er gestoppt werden soll, gesetzt von „Cancel“ oder von „Remove“. Der Worker beendet yt-dlp im nächsten Tick. Bis dahin zeigt die Liste „Cancelling…“. Mit „Cancel“ endet der Eintrag als abgebrochen, mit „Remove“ verschwindet er. Wird er vorher fertig, bleibt er fertig.
_Avoid_: Abbruch-Status, Stopp-Signal
