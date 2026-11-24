import { describe, expect, it } from "vitest";
import { nameProblem } from "@/lib/validation";

describe("nameProblem (rriv-api's getNameSchema: 3–20 after trimming)", () => {
  it("accepts 3 to 20 characters, ignoring surrounding spaces", () => {
    expect(nameProblem("abc", "Name")).toBeNull();
    expect(nameProblem("  abc  ", "Name")).toBeNull();
    expect(nameProblem("a".repeat(20), "Name")).toBeNull();
  });

  it("rejects too short or too long", () => {
    expect(nameProblem("ab", "Name")).toBe("Name must be 3–20 characters.");
    expect(nameProblem(" ab ", "Name")).toBe("Name must be 3–20 characters.");
    expect(nameProblem("a".repeat(21), "Name")).toBe("Name must be 3–20 characters.");
  });

  it("requires a value unless optional", () => {
    expect(nameProblem("  ", "Name")).toBe("Name is required.");
    expect(nameProblem("", "Description", true)).toBeNull();
    expect(nameProblem("ab", "Description", true)).toBe("Description must be 3–20 characters.");
  });
});
