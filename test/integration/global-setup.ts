import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { ensureMedia } from "../fixtures/media";
import { startFixtureServer } from "../fixtures/server";

declare module "vitest" {
  export interface ProvidedContext {
    fixtureUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const mediaDir = await ensureMedia(join(import.meta.dirname, "../fixtures/.cache"));
  const server = await startFixtureServer({ mediaDir });
  project.provide("fixtureUrl", server.url);
  return () => server.close();
}
