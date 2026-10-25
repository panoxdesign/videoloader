import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIP, ensureMedia, THUMBNAIL } from "./media.ts";

/**
 * Einzelseiten mit `og:`-Tags. yt-dlp nimmt sie über den generic-Extractor.
 * Die Medien-ID kommt aus dem Dateinamen des Mediums, deshalb liefert jede Seite
 * dasselbe Medium unter ihrem eigenen Namen aus (`/media/clip-one.mp4`).
 */
const PAGES: Record<string, { title: string }> = {
  "clip-one": { title: "Clip One" },
  "clip-two": { title: "Clip Two" },
};

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
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head>
    <title>${PAGES[page[1]].title}</title>
    <meta property="og:title" content="${PAGES[page[1]].title}">
    <meta property="og:video" content="${media}">
    <meta property="og:video:type" content="video/mp4">
    <meta property="og:image" content="${origin}/media/${THUMBNAIL}">
  </head>
  <body></body>
</html>`);
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

async function sendFile(res: ServerResponse, file: string, rate?: number) {
  const { size } = await stat(file);
  res.setHeader("content-length", size);
  res.setHeader("content-type", file.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
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
