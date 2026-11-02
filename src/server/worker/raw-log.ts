/** Der Rohlog eines Queue-Eintrags hält die letzten 64 KB der Ausgabe von yt-dlp. */
export const RAW_LOG_MAX_BYTES = 64 * 1024;

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/**
 * Ringpuffer für die Zeilen, die der Zeilen-Parser nicht auswertet. Ist er voll, fallen die
 * ältesten ganzen Zeilen heraus. Eine einzelne Zeile über der Grenze behält ihr Ende, ohne ein
 * Zeichen zu zerschneiden.
 */
export class RawLog {
  private lines: { text: string; bytes: number }[] = [];
  /** Bytes aller Zeilen samt `\n` dazwischen. */
  private bytes = 0;

  constructor(private readonly maxBytes = RAW_LOG_MAX_BYTES) {}

  push(line: string) {
    let text = line;
    let bytes = byteLength(text);
    if (bytes > this.maxBytes) {
      const encoded = encoder.encode(text);
      let start = encoded.length - this.maxBytes;
      // Folgebytes eines UTF-8-Zeichens beginnen mit 0b10.
      while (start < encoded.length && (encoded[start] & 0xc0) === 0x80) start++;
      text = new TextDecoder().decode(encoded.subarray(start));
      bytes = encoded.length - start;
    }
    this.lines.push({ text, bytes });
    this.bytes += bytes + (this.lines.length > 1 ? 1 : 0);
    while (this.bytes > this.maxBytes) {
      const dropped = this.lines.shift()!;
      this.bytes -= dropped.bytes + 1;
    }
  }

  text() {
    return this.lines.map((line) => line.text).join("\n");
  }
}
