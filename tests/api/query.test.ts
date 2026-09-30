import { describe, expect, it } from "vitest";
import { buildQuery } from "@/api/query";

describe("buildQuery", () => {
  it("serializes defined values", () => {
    expect(buildQuery({ a: 1, b: "x", c: true })).toBe("?a=1&b=x&c=true");
  });

  it("skips undefined, null and empty strings", () => {
    expect(buildQuery({ a: undefined, b: null, c: "", d: "  ", e: 2 })).toBe(
      "?e=2",
    );
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
  });

  it("url-encodes values", () => {
    expect(buildQuery({ name: "well a" })).toBe("?name=well+a");
  });
});
