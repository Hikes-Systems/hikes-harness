import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PALETTE,
  PALETTES,
  isSessionNav,
  migrateTheme,
  nextScheme,
  paletteInfo,
} from "../src/lib/palettes.ts";

test("the six palettes have unique ids and explicit color schemes", () => {
  assert.equal(PALETTES.length, 6);
  assert.equal(new Set(PALETTES.map((palette) => palette.id)).size, 6);
  assert.equal(PALETTES.filter((palette) => palette.scheme === "light").length, 3);
  assert.equal(PALETTES.filter((palette) => palette.scheme === "dark").length, 3);
  assert.equal(paletteInfo(DEFAULT_PALETTE).id, DEFAULT_PALETTE);
});

test("stored paper and ink themes migrate without losing the user's scheme", () => {
  assert.equal(migrateTheme("paper"), "daylight");
  assert.equal(migrateTheme("ink"), "cinema");
  assert.equal(migrateTheme("porcelain"), "porcelain");
  assert.equal(migrateTheme("unknown"), undefined);
});

test("the scheme toggle keeps related light and dark families together", () => {
  for (const palette of PALETTES) {
    const next = nextScheme(palette.id);
    assert.notEqual(paletteInfo(next).scheme, palette.scheme);
    assert.equal(nextScheme(next), palette.id);
  }
});

test("session navigation accepts only the three supported layouts", () => {
  assert.equal(isSessionNav("sidebar"), true);
  assert.equal(isSessionNav("top"), true);
  assert.equal(isSessionNav("hidden"), true);
  assert.equal(isSessionNav("bottom"), false);
  assert.equal(isSessionNav(undefined), false);
});
