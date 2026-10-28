import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Db } from "@/server/db/open";
import { queueEntries } from "@/server/db/schema";
import { contentDisposition } from "@/server/files/http";
import { deleteDoneEntry, findMediaFile, serveMediaFile } from "@/server/files/media-file";
import { dataPaths } from "@/server/paths";
import { enqueue, getEntry } from "@/server/queue";
import { tempDb, VIDEO } from "./helpers";

const CONTENT = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
const NAME = "Grüße aus Köln⧸Zürich： Café & Crème brûlée？ [umlaut-clip].mp4";

/** Ein fertiger Eintrag, dessen Mediendatei der Test selbst anlegt. */
async function doneEntry(db: Db, filePath: string, content: Buffer | null = CONTENT) {
  if (content) await writeFile(filePath, content);
  const { id } = enqueue(db, "https://example.com/v", VIDEO, 1);
  db.update(queueEntries)
    .set({ state: "done", filePath, fileSize: content?.length ?? null, finishedAt: 2 })
    .where(eq(queueEntries.id, id))
    .run();
  return getEntry(db, id)!;
}

async function setup() {
  const { dataDir, db } = await tempDb();
  const { downloads } = dataPaths(dataDir);
  await mkdir(downloads, { recursive: true });
  return { dataDir, db, downloads };
}

describe("media files", () => {
  it("serves the whole file with its name, type and size", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));

    const response = await serveMediaFile(downloads, entry, new Headers());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-disposition")).toBe(contentDisposition(NAME));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(CONTENT);
  });

  it("answers a range request with 206 and exactly that part", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));

    const response = await serveMediaFile(downloads, entry, new Headers({ range: "bytes=100-199" }));

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(CONTENT.subarray(100, 200));
  });

  it("answers a range behind the end with 416", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));

    const response = await serveMediaFile(downloads, entry, new Headers({ range: "bytes=1000-" }));

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
  });

  it("resumes only while the file is unchanged (If-Range)", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));
    const etag = (await serveMediaFile(downloads, entry, new Headers())).headers.get("etag")!;

    const same = await serveMediaFile(downloads, entry, new Headers({ range: "bytes=0-9", "if-range": etag }));
    const changed = await serveMediaFile(downloads, entry, new Headers({ range: "bytes=0-9", "if-range": `"other"` }));

    expect(same.status).toBe(206);
    expect(changed.status).toBe(200);
    expect(changed.headers.get("content-length")).toBe("1000");
  });

  it("answers 404 and reports the file missing once it is deleted by hand", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));
    expect(await findMediaFile(downloads, entry)).toBeDefined();

    await rm(join(downloads, NAME));

    expect(await findMediaFile(downloads, entry)).toBeUndefined();
    expect((await serveMediaFile(downloads, entry, new Headers())).status).toBe(404);
    // Der Eintrag bleibt fertig.
    expect(getEntry(db, entry.id)?.state).toBe("done");
  });

  it("serves nothing outside downloads/, also not through a symlink", async () => {
    const { dataDir, db, downloads } = await setup();
    const secret = join(dataDir, "secret.mp4");
    await writeFile(secret, CONTENT);
    await mkdir(join(downloads, "Playlist"));
    await symlink(secret, join(downloads, "Playlist", "Link [x].mp4"));
    await symlink(dataDir, join(downloads, "escape"));

    for (const filePath of [secret, join(downloads, "..", "secret.mp4"), join(downloads, "Playlist", "Link [x].mp4"), join(downloads, "escape", "secret.mp4")]) {
      const entry = await doneEntry(db, filePath, null);
      expect(await findMediaFile(downloads, entry), filePath).toBeUndefined();
      expect((await serveMediaFile(downloads, entry, new Headers())).status, filePath).toBe(404);
    }
  });

  it("serves nothing for entries that are not done", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));

    expect((await serveMediaFile(downloads, undefined, new Headers())).status).toBe(404);
    expect((await serveMediaFile(downloads, { ...entry, state: "running" }, new Headers())).status).toBe(404);
  });
});

describe("delete", () => {
  it("removes media file and entry together", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME));

    expect(await deleteDoneEntry(db, downloads, entry.id)).toBe(true);

    expect(existsSync(join(downloads, NAME))).toBe(false);
    expect(getEntry(db, entry.id)).toBeUndefined();
  });

  it("removes an entry whose file is missing", async () => {
    const { db, downloads } = await setup();
    const entry = await doneEntry(db, join(downloads, NAME), null);

    expect(await deleteDoneEntry(db, downloads, entry.id)).toBe(true);
    expect(getEntry(db, entry.id)).toBeUndefined();
  });

  it("never touches a file outside downloads/", async () => {
    const { dataDir, db, downloads } = await setup();
    const secret = join(dataDir, "secret.mp4");
    await writeFile(secret, CONTENT);
    await symlink(dataDir, join(downloads, "escape"));
    const entry = await doneEntry(db, join(downloads, "escape", "secret.mp4"), null);

    expect(await deleteDoneEntry(db, downloads, entry.id)).toBe(true);

    expect(existsSync(secret)).toBe(true);
    expect(getEntry(db, entry.id)).toBeUndefined();
  });

  it("leaves entries alone that are not done", async () => {
    const { db, downloads } = await setup();
    const { id } = enqueue(db, "https://example.com/v", VIDEO, 1);

    expect(await deleteDoneEntry(db, downloads, id)).toBe(false);
    expect(await deleteDoneEntry(db, downloads, 9999)).toBe(false);
    expect(getEntry(db, id)?.state).toBe("waiting");
  });
});
