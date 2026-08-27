import assert from "node:assert/strict";
import test from "node:test";

import {
  listSavedFaceNames,
  loadFace,
  loadLastSession,
  seedDefaultFaceArchive
} from "../src/storage.js";

function installLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, value);
      }
    }
  };

  return values;
}

test.afterEach(() => {
  delete globalThis.window;
});

test("default archive seeds its current face and saves when no cache exists", () => {
  installLocalStorage();
  const archive = {
    currentFace: { yaw: 0.5, skinColor: "#abcdef" },
    saves: {
      Alpha: { yaw: -1 },
      Beta: { yaw: 1 }
    }
  };

  const initialFace = seedDefaultFaceArchive(archive);

  assert.deepEqual(initialFace, archive.currentFace);
  assert.notEqual(initialFace, archive.currentFace);
  assert.deepEqual(listSavedFaceNames(), ["Alpha", "Beta"]);
  assert.deepEqual(loadFace("Alpha"), archive.saves.Alpha);
  assert.equal(loadLastSession(), null);
});

test("default archive does not replace an existing last session", () => {
  installLocalStorage({
    "testface:lastSession": JSON.stringify({ yaw: -0.25 })
  });

  const initialFace = seedDefaultFaceArchive({
    currentFace: { yaw: 1 },
    saves: { Default: { yaw: 1 } }
  });

  assert.equal(initialFace, null);
  assert.deepEqual(loadLastSession(), { yaw: -0.25 });
  assert.deepEqual(listSavedFaceNames(), []);
});

test("default archive does not replace an existing saves cache", () => {
  installLocalStorage({
    "testface:saves": JSON.stringify({ Existing: { yaw: 0 } })
  });

  const initialFace = seedDefaultFaceArchive({
    currentFace: { yaw: 1 },
    saves: { Default: { yaw: 1 } }
  });

  assert.equal(initialFace, null);
  assert.deepEqual(listSavedFaceNames(), ["Existing"]);
  assert.deepEqual(loadFace("Existing"), { yaw: 0 });
});

test("invalid default archives are ignored", () => {
  installLocalStorage();

  assert.equal(seedDefaultFaceArchive(null), null);
  assert.equal(seedDefaultFaceArchive({ currentFace: {}, saves: [] }), null);
  assert.deepEqual(listSavedFaceNames(), []);
});
