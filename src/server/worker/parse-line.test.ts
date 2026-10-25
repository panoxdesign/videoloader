import { describe, expect, it } from "vitest";
import { parseLine } from "./parse-line";

describe("parseLine", () => {
  it("parses a PROGRESS line without speed and eta", () => {
    expect(
      parseLine(
        'PROGRESS {"status": "downloading", "downloaded_bytes": 1024, "total_bytes": 7425979}',
      ),
    ).toEqual({
      kind: "progress",
      status: "downloading",
      downloadedBytes: 1024,
      totalBytes: 7425979,
    });
  });

  it("parses speed and eta of a PROGRESS line", () => {
    expect(
      parseLine(
        'PROGRESS {"status": "downloading", "downloaded_bytes": 3072, "total_bytes": 7425979, "speed": 1828942.78, "eta": 4}',
      ),
    ).toEqual({
      kind: "progress",
      status: "downloading",
      downloadedBytes: 3072,
      totalBytes: 7425979,
      speed: 1828942.78,
      eta: 4,
    });
  });

  it("parses an HLS PROGRESS line with an estimate and fragments instead of total_bytes", () => {
    expect(
      parseLine(
        'PROGRESS {"status": "downloading", "downloaded_bytes": 15360, "total_bytes_estimate": 15360, "speed": 0, "fragment_index": 0, "fragment_count": 1}',
      ),
    ).toEqual({
      kind: "progress",
      status: "downloading",
      downloadedBytes: 15360,
      totalBytesEstimate: 15360,
      speed: 0,
      fragmentIndex: 0,
      fragmentCount: 1,
    });
  });

  it("parses a POSTPROCESS line", () => {
    expect(
      parseLine('POSTPROCESS {"status": "started", "postprocessor": "Merger"}'),
    ).toEqual({ kind: "postprocess", status: "started", postprocessor: "Merger" });
  });

  it("parses a DONE line with the file path of the media file", () => {
    expect(
      parseLine(
        'DONE {"filepath": "/data/downloads/Clip One\\uff1a \\u00c4 test [clip-one].mp4", "id": "clip-one", "title": "Clip One: \\u00c4 test", "ext": "mp4", "extractor_key": "Generic", "format_id": "0"}',
      ),
    ).toEqual({
      kind: "done",
      filepath: "/data/downloads/Clip One： Ä test [clip-one].mp4",
      id: "clip-one",
      title: "Clip One: Ä test",
      ext: "mp4",
      extractorKey: "Generic",
      formatId: "0",
    });
  });

  it("treats a WARNING line as a plain log line", () => {
    const line = "WARNING: [generic] Falling back on generic information extractor";
    expect(parseLine(line)).toEqual({ kind: "log", line });
  });

  it("treats a prefixed line without valid JSON as a plain log line", () => {
    expect(parseLine("PROGRESS NA")).toEqual({ kind: "log", line: "PROGRESS NA" });
  });
});
