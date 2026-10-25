"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db";
import { enqueue } from "@/server/queue";

export async function addEntry(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return;
  enqueue(getDb(), url, Date.now());
  refresh();
}
