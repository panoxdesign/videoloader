import { describe, expect, it } from "vitest";
import { isJsonRequest, isSameOrigin } from "./same-origin";

describe("isSameOrigin", () => {
  it.each([
    ["the same host", { origin: "http://localhost:3000", host: "localhost:3000" }],
    ["a host in other case", { origin: "http://localhost:3000", host: "LOCALHOST:3000" }],
    // Hinter einem Proxy zählt der weitergereichte Host, nicht der interne.
    ["the forwarded host", { origin: "https://video.example", host: "app:3000", "x-forwarded-host": "video.example" }],
    ["the first of several forwarded hosts", { origin: "https://video.example", "x-forwarded-host": "video.example, proxy.internal" }],
  ])("accepts %s", (_, headers) => {
    expect(isSameOrigin(new Headers(headers))).toBe(true);
  });

  it.each([
    ["a foreign origin", { origin: "https://evil.example", host: "localhost:3000" }],
    ["another port", { origin: "http://localhost:4000", host: "localhost:3000" }],
    ["no origin", { host: "localhost:3000" }],
    ["the origin null", { origin: "null", host: "localhost:3000" }],
    ["an unreadable origin", { origin: "not a url", host: "localhost:3000" }],
    ["no host at all", { origin: "http://localhost:3000" }],
    // Der weitergereichte Host hat Vorrang, ein passender `host` rettet nichts.
    ["a forwarded host that differs", { origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-host": "video.example" }],
  ])("rejects %s", (_, headers) => {
    expect(isSameOrigin(new Headers(headers))).toBe(false);
  });
});

describe("isJsonRequest", () => {
  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON"])("accepts %s", (type) => {
    expect(isJsonRequest(new Headers({ "content-type": type }))).toBe(true);
  });

  it.each([
    ["text/plain", "text/plain"],
    ["a form", "application/x-www-form-urlencoded"],
    ["a lookalike", "application/jsonp"],
  ])("rejects %s", (_, type) => {
    expect(isJsonRequest(new Headers({ "content-type": type }))).toBe(false);
  });

  it("rejects a missing content type", () => {
    expect(isJsonRequest(new Headers())).toBe(false);
  });
});
