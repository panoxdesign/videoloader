import { getDb } from "@/server/db";
import { getEntry } from "@/server/queue";

/**
 * Der Rohlog eines fehlgeschlagenen Eintrags, erst bei „Show details“ geladen. Mit der Seite
 * käme er bei jedem Neuladen mit, bis zu 64 KB je Eintrag.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/entries/[id]/log">) {
  const { id } = await ctx.params;
  const entry = /^\d+$/.test(id) ? getEntry(getDb(), Number(id)) : undefined;
  if (entry?.state !== "failed" || entry.rawLog === null) {
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(entry.rawLog, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
