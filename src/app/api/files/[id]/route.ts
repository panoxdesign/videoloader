import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { serveMediaFile } from "@/server/files/media-file";
import { dataDirFromEnv, dataPaths } from "@/server/paths";
import { getEntry } from "@/server/queue";

/** Die Mediendatei eines fertigen Eintrags. Der Pfad kommt immer aus der DB. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const entry = /^\d+$/.test(id) ? getEntry(getDb(), Number(id)) : undefined;
  return serveMediaFile(dataPaths(dataDirFromEnv()).downloads, entry, request.headers);
}
