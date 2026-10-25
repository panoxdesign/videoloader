export type ProgressLine = {
  kind: "progress";
  status: string;
  downloadedBytes?: number;
  totalBytes?: number;
  totalBytesEstimate?: number;
  speed?: number;
  eta?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
};

export type PostprocessLine = {
  kind: "postprocess";
  status: string;
  postprocessor: string;
};

export type DoneLine = {
  kind: "done";
  filepath: string;
  id: string;
  title: string;
  ext: string;
  extractorKey: string;
  formatId: string;
};

export type LogLine = { kind: "log"; line: string };

export type ParsedLine = ProgressLine | PostprocessLine | DoneLine | LogLine;

const PROGRESS = "PROGRESS ";
const POSTPROCESS = "POSTPROCESS ";
const DONE = "DONE ";

// yt-dlp schreibt `NA`, wenn ein Template-Feld fehlt. Solche Zeilen gehören ins Rohlog.
function payload(line: string, prefix: string) {
  if (!line.startsWith(prefix)) return undefined;
  try {
    const raw = JSON.parse(line.slice(prefix.length));
    return typeof raw === "object" && raw !== null ? raw : undefined;
  } catch {
    return undefined;
  }
}

export function parseLine(line: string): ParsedLine {
  let raw;
  if ((raw = payload(line, DONE))) {
    return {
      kind: "done",
      filepath: raw.filepath,
      id: raw.id,
      title: raw.title,
      ext: raw.ext,
      extractorKey: raw.extractor_key,
      formatId: raw.format_id,
    };
  }
  if ((raw = payload(line, POSTPROCESS))) {
    return {
      kind: "postprocess",
      status: raw.status,
      postprocessor: raw.postprocessor,
    };
  }
  if ((raw = payload(line, PROGRESS))) {
    return {
      kind: "progress",
      status: raw.status,
      downloadedBytes: raw.downloaded_bytes,
      totalBytes: raw.total_bytes,
      totalBytesEstimate: raw.total_bytes_estimate,
      speed: raw.speed,
      eta: raw.eta,
      fragmentIndex: raw.fragment_index,
      fragmentCount: raw.fragment_count,
    };
  }
  return { kind: "log", line };
}
