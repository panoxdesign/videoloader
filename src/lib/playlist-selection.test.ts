import { describe, expect, it } from "vitest";
import {
  initialSelection,
  isSelectable,
  largeSelectionHint,
  selectAllState,
  toggleAll,
  toggleItem,
  type PreviewItem,
} from "./playlist-selection";

const item = (number: number, duplicate?: PreviewItem["duplicate"]): PreviewItem => ({ number, duplicate });
const live = (number: number, block: NonNullable<PreviewItem["live"]> = "live"): PreviewItem => ({ number, live: block });

describe("initialSelection", () => {
  it("selects every item except duplicates", () => {
    const items = [item(1), item(2, "downloaded"), item(3), item(4, "queued")];
    expect([...initialSelection(items)]).toEqual([1, 3]);
  });

  it("leaves out streams that are live, upcoming or just ended", () => {
    const items = [item(1), live(2), live(3, "upcoming"), live(4, "justEnded"), item(5)];
    expect([...initialSelection(items)]).toEqual([1, 5]);
  });
});

describe("selectAllState", () => {
  const items = [item(1), item(2), item(3)];

  it("is all, none or mixed", () => {
    expect(selectAllState(new Set([1, 2, 3]), items)).toBe("all");
    expect(selectAllState(new Set(), items)).toBe("none");
    expect(selectAllState(new Set([2]), items)).toBe("mixed");
  });

  it("is mixed when duplicates are left out of the start selection", () => {
    expect(selectAllState(initialSelection([item(1), item(2, "queued")]), [item(1), item(2, "queued")])).toBe("mixed");
  });

  it("is none for an empty playlist", () => {
    expect(selectAllState(new Set(), [])).toBe("none");
  });

  it("is all when every selectable entry is ticked, streams do not count", () => {
    const items = [item(1), live(2), item(3)];
    expect(selectAllState(initialSelection(items), items)).toBe("all");
  });

  it("is none when only streams are left", () => {
    expect(selectAllState(new Set(), [live(1), live(2, "upcoming")])).toBe("none");
  });
});

describe("toggleAll", () => {
  const items = [item(1), item(2, "downloaded"), item(3)];

  it("selects everything from mixed, duplicates included", () => {
    expect([...toggleAll(new Set([1, 3]), items)].sort()).toEqual([1, 2, 3]);
  });

  it("selects everything from none", () => {
    expect([...toggleAll(new Set(), items)].sort()).toEqual([1, 2, 3]);
  });

  it("clears everything from all", () => {
    expect([...toggleAll(new Set([1, 2, 3]), items)]).toEqual([]);
  });

  it("never selects streams", () => {
    const withLive = [item(1), live(2), item(3, "queued"), live(4, "upcoming")];
    expect([...toggleAll(new Set(), withLive)].sort()).toEqual([1, 3]);
    expect([...toggleAll(new Set([1, 3]), withLive)]).toEqual([]);
  });
});

describe("isSelectable", () => {
  it("is true for normal entries and duplicates, false for streams", () => {
    expect(isSelectable(item(1))).toBe(true);
    expect(isSelectable(item(1, "downloaded"))).toBe(true);
    expect(isSelectable(live(1))).toBe(false);
    expect(isSelectable(live(1, "justEnded"))).toBe(false);
  });
});

describe("toggleItem", () => {
  it("ticks and unticks one number without touching the others", () => {
    const start = new Set([1, 3]);
    expect([...toggleItem(start, 2)].sort()).toEqual([1, 2, 3]);
    expect([...toggleItem(start, 3)]).toEqual([1]);
    expect([...start]).toEqual([1, 3]);
  });
});

describe("largeSelectionHint", () => {
  it("is shown from 100 selected entries on", () => {
    expect(largeSelectionHint(99, 15)).toBeUndefined();
    expect(largeSelectionHint(100, 15)).toBe(
      "Large selection – downloads are spaced out to avoid rate limits, this will take at least ~25 min",
    );
  });

  it("rounds down to whole hours from one hour on, since it says at least", () => {
    expect(largeSelectionHint(240, 15)).toMatch(/at least ~1 h$/); // 60 min
    expect(largeSelectionHint(500, 15)).toMatch(/at least ~2 h$/); // 125 min
    expect(largeSelectionHint(719, 15)).toMatch(/at least ~2 h$/); // 179 min 45 s
    expect(largeSelectionHint(239, 15)).toMatch(/at least ~59 min$/); // 59 min 45 s
  });

  it("is not shown without a start interval", () => {
    expect(largeSelectionHint(500, 0)).toBeUndefined();
  });
});
