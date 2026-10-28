import type { Media } from "@/lib/media";

export type DownloadArgsInput = {
  url: string;
  media: Media;
  downloadsDir: string;
  tmpDir: string;
  cacheDir: string;
};

/** Argumente für einen Download als MP4 mit Auflösungsgrenze oder als MP3. */
export function buildDownloadArgs({ url, media, downloadsDir, tmpDir, cacheDir }: DownloadArgsInput): string[] {
  return [
    "--no-playlist",
    "--newline",
    "--progress",
    "--progress-delta", "0.5",
    "--progress-template",
    "download:PROGRESS %(progress.{status,downloaded_bytes,total_bytes,total_bytes_estimate,speed,eta,fragment_index,fragment_count})j",
    "--progress-template",
    "postprocess:POSTPROCESS %(progress.{status,postprocessor})j",
    "--print",
    "after_move:DONE %(.{filepath,id,title,ext,extractor_key,format_id})j",
    "--windows-filenames",
    "--trim-filenames", "180",
    "--cache-dir", cacheDir,
    ...mediaArgs(media),
    "-P", downloadsDir,
    "-P", `temp:${tmpDir}`,
    "-o", "%(title)s [%(id)s].%(ext)s",
    "--",
    url,
  ];
}

/**
 * Ein späteres `-S` hat Vorrang vor dem aus `-t mp4`, muss also dahinter stehen.
 * `channels:2` nimmt AAC Stereo statt AAC 5.1, ohne die Videoauswahl zu ändern
 * (live geprüft an `aqz-KE-bpKQ`: 140 statt 258 bei allen vier Stufen).
 */
function mediaArgs(media: Media): string[] {
  if (media.mediaType === "audio") {
    return ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "192K", "--embed-metadata", "--embed-thumbnail"];
  }
  const res = media.resolution === "best" ? "res" : `res:${media.resolution}`;
  return ["-t", "mp4", "-S", `${res},channels:2`];
}
