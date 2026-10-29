import type { Media } from "@/lib/media";
import { FILE_LINE } from "../check/parse-check";
import { outputTemplate } from "../files/file-name";

export type DownloadArgsInput = {
  url: string;
  media: Media;
  /** Der reservierte Name unter `downloads/`, mit Endung. */
  fileName: string;
  downloadsDir: string;
  tmpDir: string;
  cacheDir: string;
};

/** Argumente für einen Download als MP4 mit Auflösungsgrenze oder als MP3. */
export function buildDownloadArgs({ url, media, fileName, downloadsDir, tmpDir, cacheDir }: DownloadArgsInput): string[] {
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
    ...commonArgs(cacheDir),
    ...mediaArgs(media),
    "-P", downloadsDir,
    "-P", `temp:${tmpDir}`,
    "-o", outputTemplate(fileName),
    "--",
    url,
  ];
}

export type CheckArgsInput = { url: string; cacheDir: string };

/**
 * Argumente für die Prüfung bei „Add“: ein JSON-Objekt, bei Playlists mit Flat-Einträgen.
 * Davor steht je Medium eine Zeile mit Medien-ID und Titel, so bereinigt, wie yt-dlp sie in
 * Dateinamen schreibt. Daraus bildet die App den Namen der Mediendatei.
 */
export function buildCheckArgs({ url, cacheDir }: CheckArgsInput): string[] {
  return [
    "-J",
    "--flat-playlist",
    "--no-playlist",
    "--windows-filenames",
    "--print", `${FILE_LINE}\t%(id)S\t%(title)S`,
    ...commonArgs(cacheDir),
    "--",
    url,
  ];
}

/** Gleich in Prüfung, Vorschau und Download. */
function commonArgs(cacheDir: string): string[] {
  return ["--cache-dir", cacheDir];
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
