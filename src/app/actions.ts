"use server";

import { refresh } from "next/cache";
import { parseMedia } from "@/lib/media";
import { getDb } from "@/server/db";
import { enqueue } from "@/server/queue";

export async function addEntry(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  const media = parseMedia({ mediaType: formData.get("mediaType"), resolution: formData.get("resolution") });
  if (!url || !media) return;
  enqueue(getDb(), url, media, Date.now());
  refresh();
}
