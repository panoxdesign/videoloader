import type { NextRequest } from "next/server";
import { parseMedia } from "@/lib/media";
import { getDb } from "@/server/db";
import { BUNDLED_YTDLP, dataDirFromEnv } from "@/server/paths";
import { loadPreview, type LoadResult } from "@/server/playlist-preview";

/**
 * Lädt die Vorschau eines Playlist-Links (ADR 0002). Ein Route Handler, weil nur er per
 * `request.signal` erfährt, dass der Browser „Cancel“ gedrückt hat. Das Einreihen bleibt eine
 * Server Action.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => undefined);
  const { url, mediaType, resolution } = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;
  const media = parseMedia({ mediaType, resolution });
  if (typeof url !== "string" || !url.trim() || !media) return Response.json({ kind: "none" } satisfies LoadResult, { status: 400 });

  const result = await loadPreview({
    db: getDb(),
    ytDlpPath: BUNDLED_YTDLP,
    dataDir: dataDirFromEnv(),
    url: url.trim(),
    media,
    signal: request.signal,
    now: Date.now(),
  });
  return Response.json(result);
}
