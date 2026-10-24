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

**Medienart**:
Die Wahl pro Queue-Eintrag, ob das Medium als Video oder nur als Audio (MP3) heruntergeladen wird.
_Avoid_: Format, Typ, Modus

**Playlist**:
Eine Sammlung von Medien einer Quelle, die per Link angegeben wird und in einzelne Queue-Einträge aufgeteilt wird.
_Avoid_: Liste, Kanal

**Mediendatei**:
Die fertige heruntergeladene Datei eines Queue-Eintrags, die auf dem Server liegt und über die App abrufbar ist. Jede Mediendatei gehört zu genau einem Queue-Eintrag.
_Avoid_: Download, Output

**Duplikat**:
Ein neuer Queue-Eintrag für dasselbe Medium mit derselben Medienart wie ein wartender oder laufender Queue-Eintrag oder eine vorhandene Mediendatei, unabhängig von der Auflösung. Dasselbe Medium heißt: gleiche Quelle und gleiche Medien-ID, nicht gleicher Link.
_Avoid_: Doppelter Download, Kopie

**Aufbewahrungsfrist**:
Die Zeitspanne ab Fertigstellung, nach der eine Mediendatei samt Queue-Eintrag automatisch gelöscht wird.
_Avoid_: TTL, Retention, Ablaufzeit
