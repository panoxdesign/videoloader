import { describe, expect, it } from "vitest";
import { parseMountinfo } from "./facts";

describe("parseMountinfo", () => {
  it("returns the mount point of every line, with octal escapes decoded", () => {
    const mountinfo = [
      "583 497 0:52 / / rw,relatime master:241 - overlay overlay rw,lowerdir=/var/lib/docker/l1",
      "602 583 0:58 / /data rw,nosuid,nodev,relatime - tmpfs tmpfs rw,uid=1000,gid=1000,inode64",
      "603 583 254:1 /docker/volumes/my\\040data/_data /srv/my\\040data rw,relatime - ext4 /dev/vda1 rw",
      "",
    ].join("\n");
    expect(parseMountinfo(mountinfo)).toEqual(["/", "/data", "/srv/my data"]);
  });
});
