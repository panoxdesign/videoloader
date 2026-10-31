import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIP, DASH_DIR, DASH_MANIFEST, ensureMedia, THUMBNAIL } from "./media.ts";

/**
 * Einzelseiten mit `og:`-Tags. yt-dlp nimmt sie über den generic-Extractor.
 * Die Medien-ID kommt aus dem Dateinamen des Mediums, deshalb liefert jede Seite
 * dasselbe Medium unter ihrem eigenen Namen aus (`/media/clip-one.mp4`).
 */
const PAGES: Record<string, { title: string }> = {
  "clip-one": { title: "Clip One" },
  "clip-two": { title: "Clip Two" },
  "clip-three": { title: "Clip Three" },
  "clip-four": { title: "Clip Four" },
  // Umlaute und Zeichen, die `--windows-filenames` ersetzt, für Dateinamen im Download.
  "umlaut-clip": { title: "Grüße aus Köln/Zürich: Café & Crème brûlée?" },
  // Für den Duplikat-Ablauf im E2E, damit kein anderer Test dasselbe Medium einreiht.
  "dup-clip": { title: "Dup Clip" },
  // `%` im Output-Template wäre ein Feld, wenn die App es nicht maskiert.
  "percent-clip": { title: "100% sure: 50%% off %(id)s" },
  // Für den RSS-Feed, damit der Playlist-Ablauf im E2E kein Medium mit anderen Tests teilt.
  "mix-one": { title: "Mix One" },
  "mix-two": { title: "Mix Two" },
  "mix-three": { title: "Mix Three" },
};

/**
 * RSS-Feed als Playlist. yt-dlp liefert die Einträge flach, ohne ID, Dauer und Vorschaubild.
 * Der Titel enthält `:`, das `--windows-filenames` für den Ordnernamen ersetzt.
 */
const FEED = { title: "Clips: The Mix", pages: ["mix-one", "mix-two", "mix-three"] };

export type FixtureServer = { url: string; close(): Promise<void> };

/** `?rate=<Bytes pro Sekunde>` an einer Seite drosselt die Auslieferung ihres Mediums. */
export async function startFixtureServer(options: {
  mediaDir: string;
  port?: number;
  host?: string;
}): Promise<FixtureServer> {
  const { mediaDir } = options;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const origin = `http://${req.headers.host}`;

    if (url.pathname === "/health") {
      res.end("ok");
      return;
    }

    const page = url.pathname.match(/^\/videos\/([\w-]+)$/);
    if (page && PAGES[page[1]]) {
      const rate = url.searchParams.get("rate");
      const media = `${origin}/media/${page[1]}.mp4${rate ? `?rate=${rate}` : ""}`;
      const title = escapeHtml(PAGES[page[1]].title);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta property="og:title" content="${title}">
    <meta property="og:video" content="${media}">
    <meta property="og:video:type" content="video/mp4">
    <meta property="og:image" content="${origin}/media/${THUMBNAIL}">
  </head>
  <body></body>
</html>`);
      return;
    }

    if (url.pathname === "/feed.rss") {
      // `?delay=<ms>` hält die Antwort zurück, für Abbruch und Timeout der Vorschau.
      const delay = Number(url.searchParams.get("delay")) || 0;
      const items = FEED.pages.map(
        (page) => `<item><title>${escapeHtml(PAGES[page].title)}</title><link>${origin}/videos/${page}</link></item>`,
      );
      const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(FEED.title)}</title>
    <link>${origin}/</link>
    ${items.join("\n    ")}
  </channel>
</rss>`;
      const timer = setTimeout(() => {
        res.setHeader("content-type", "application/rss+xml; charset=utf-8");
        res.end(feed);
      }, delay);
      res.on("close", () => clearTimeout(timer));
      return;
    }

    // DASH als <video>-Quelle. yt-dlp nummeriert solche Quellen, ID und Titel
    // lauten deshalb „clip-dash-1“ und „Clip Dash (1)“.
    if (url.pathname === "/videos/clip-dash") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>Clip Dash</title>
    <meta property="og:title" content="Clip Dash">
  </head>
  <body>
    <video controls>
      <source src="${origin}/${DASH_DIR}/${DASH_MANIFEST}" type="application/dash+xml">
    </video>
  </body>
</html>`);
      return;
    }
    const dash = url.pathname.match(/^\/dash\/([\w-]+\.(?:mpd|m4s))$/);
    if (dash) {
      void sendFile(res, join(mediaDir, DASH_DIR, dash[1]));
      return;
    }

    const media = url.pathname.match(/^\/media\/([\w-]+)\.mp4$/);
    if (media && PAGES[media[1]]) {
      const rate = Number(url.searchParams.get("rate")) || undefined;
      void sendFile(res, join(mediaDir, CLIP), rate);
      return;
    }
    if (url.pathname === `/media/${THUMBNAIL}`) {
      void sendFile(res, join(mediaDir, THUMBNAIL));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve),
  );
  const { port } = server.address() as AddressInfo;
  const host = options.host && options.host !== "0.0.0.0" ? options.host : "127.0.0.1";
  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  jpg: "image/jpeg",
  mpd: "application/dash+xml",
  m4s: "video/iso.segment",
};

async function sendFile(res: ServerResponse, file: string, rate?: number) {
  const size = await stat(file).then((s) => s.size, () => undefined);
  if (size === undefined) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("content-length", size);
  res.setHeader("content-type", CONTENT_TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream");
  if (!rate) {
    createReadStream(file).pipe(res);
    return;
  }
  // Gedrosselt: alle 100 ms ein Zehntel der Rate.
  const stream = createReadStream(file, { highWaterMark: Math.max(1, Math.floor(rate / 10)) });
  stream.on("data", (chunk) => {
    stream.pause();
    res.write(chunk, () => setTimeout(() => stream.resume(), 100));
  });
  stream.on("end", () => res.end());
  res.on("close", () => stream.destroy());
}

// Direkt gestartet (Test-Compose): `node test/fixtures/server.ts`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cache = process.env.FIXTURE_CACHE ?? join(import.meta.dirname, ".cache");
  const mediaDir = await ensureMedia(cache);
  const server = await startFixtureServer({
    mediaDir,
    port: Number(process.env.PORT ?? 8080),
    host: "0.0.0.0",
  });
  console.log(`fixture server listening on ${server.url}`);
}
