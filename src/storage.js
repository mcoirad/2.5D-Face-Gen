const SAVES_KEY = "testface:saves";
const LAST_SESSION_KEY = "testface:lastSession";

function readStore(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function snapshot(params) {
  return JSON.parse(JSON.stringify(params));
}

function readSaves() {
  const saves = readStore(SAVES_KEY);
  return saves && typeof saves === "object" ? saves : {};
}

function normalizeImportedSaves(payload) {
  const saves = payload?.saves && typeof payload.saves === "object"
    ? payload.saves
    : payload;

  if (!saves || Array.isArray(saves) || typeof saves !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(saves).filter(([, value]) => (
      value && !Array.isArray(value) && typeof value === "object"
    ))
  );
}

export function listSavedFaceNames() {
  return Object.keys(readSaves()).sort((a, b) => a.localeCompare(b));
}

export function createFaceArchive(currentParams) {
  return {
    format: "test-face-saves",
    version: 1,
    exportedAt: new Date().toISOString(),
    currentFace: snapshot(currentParams),
    saves: readSaves()
  };
}

export function importFaceArchive(payload) {
  const importedSaves = normalizeImportedSaves(payload);

  if (!importedSaves) {
    return { ok: false, count: 0 };
  }

  const saves = {
    ...readSaves(),
    ...importedSaves
  };

  return {
    ok: writeStore(SAVES_KEY, saves),
    count: Object.keys(importedSaves).length
  };
}

export function saveFace(name, params) {
  const saves = readSaves();
  saves[name] = snapshot(params);
  return writeStore(SAVES_KEY, saves);
}

export function loadFace(name) {
  const saves = readSaves();
  return Object.prototype.hasOwnProperty.call(saves, name) ? saves[name] : null;
}

export function deleteFace(name) {
  const saves = readSaves();

  if (Object.prototype.hasOwnProperty.call(saves, name)) {
    delete saves[name];
    return writeStore(SAVES_KEY, saves);
  }

  return false;
}

export function saveLastSession(params) {
  return writeStore(LAST_SESSION_KEY, snapshot(params));
}

export function loadLastSession() {
  return readStore(LAST_SESSION_KEY);
}
