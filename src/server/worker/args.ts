export type DownloadArgsInput = {
  url: string;
  downloadsDir: string;
  tmpDir: string;
  cacheDir: string;
};

/**
 * Argumente für einen Download. Die Medienart ist vorerst fest MP4 bis 1080p.
 * `-S` muss hinter `-t mp4` stehen, sonst geht die Auflösungsgrenze verloren.
 */
export function buildDownloadArgs({ url, downloadsDir, tmpDir, cacheDir }: DownloadArgsInput): string[] {
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
    "-t", "mp4",
    "-S", "res:1080",
    "-P", downloadsDir,
    "-P", `temp:${tmpDir}`,
    "-o", "%(title)s [%(id)s].%(ext)s",
    "--",
    url,
  ];
}
