import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { register } from "@/instrumentation";
import { migrateDb, openDb } from "@/server/db/open";
import { dataPaths } from "@/server/paths";
import { enqueue, getEntry } from "@/server/queue";
import { tempDataDir, waitFor } from "./helpers";

const fixtureUrl = inject("fixtureUrl");

describe("register", () => {
  it("does not start a second worker when called twice in the same process", async () => {
    const dataDir = await tempDataDir();
    process.env.DATA_DIR = dataDir;
    process.env.NEXT_RUNTIME = "nodejs";

    await register();
    await register();

    for (const dir of ["downloads", "tmp", "db", "cache", "bin", "config"]) {
      expect(existsSync(join(dataDir, dir)), dir).toBe(true);
    }

    // Gedrosselt auf etwa 4 s je Download. Ein zweiter Worker hätte nach einem Tick einen zweiten Slot.
    const db = openDb(dataPaths(dataDir).db);
    migrateDb(db);
    const first = enqueue(db, `${fixtureUrl}/videos/clip-one?rate=100000`, 1);
    const second = enqueue(db, `${fixtureUrl}/videos/clip-two?rate=100000`, 2);

    await waitFor(() => getEntry(db, first.id)?.state === "running");
    const seen = new Set<string>();
    const until = Date.now() + 2500;
    while (Date.now() < until && getEntry(db, first.id)?.state === "running") {
      seen.add(getEntry(db, second.id)!.state);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(getEntry(db, first.id)?.state).toBe("running");
    expect([...seen]).toEqual(["waiting"]);

    await waitFor(() => getEntry(db, second.id)?.state === "done", { timeoutMs: 30_000 });
  });
});
