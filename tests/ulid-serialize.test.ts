import { describe, expect, it } from "vitest";
import { serialize, sha256Hex } from "../src/data/serialize";
import { ulid } from "../src/data/ulid";

describe("ulid", () => {
  it("is 26 chars, unique, and sorts by time", () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 500 }, () => ulid())).size).toBe(500);
  });
});

describe("serialize", () => {
  it("is canonical regardless of key order and drops undefined", () => {
    expect(serialize({ b: 1, a: { d: 2, c: undefined, e: 3 } })).toBe(serialize({ a: { e: 3, d: 2 }, b: 1 }));
    expect(serialize({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });
  it("hashes stably", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
