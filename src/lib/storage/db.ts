/**
 * Local persistence in IndexedDB.
 *
 * Two object stores:
 *  - `exercises`: metadata, transcript, blanks, responses and results.
 *  - `audio`: the uploaded audio blob, keyed by exercise id. Saved only when
 *    the browser grants enough quota; otherwise the exercise is flagged
 *    `audioStored: false` and the user is asked to re-attach the file.
 *
 * If IndexedDB is unavailable (some private-browsing modes) everything falls
 * back to an in-memory store that lasts for the current tab only.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Exercise } from "../types";

interface AudioRecord {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  savedAt: number;
}

interface ListenlyDB extends DBSchema {
  exercises: { key: string; value: Exercise; indexes: { updatedAt: number } };
  audio: { key: string; value: AudioRecord };
}

const DB_NAME = "listenly";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ListenlyDB> | null> | null = null;
const memExercises = new Map<string, Exercise>();
const memAudio = new Map<string, AudioRecord>();
/** Audio for the current tab session — always available until reload, even if persisting failed. */
const sessionAudio = new Map<string, Blob>();

export function getDB(): Promise<IDBPDatabase<ListenlyDB> | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (typeof indexedDB === "undefined") return null;
    try {
      return await openDB<ListenlyDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const ex = db.createObjectStore("exercises", { keyPath: "id" });
          ex.createIndex("updatedAt", "updatedAt");
          db.createObjectStore("audio", { keyPath: "id" });
        },
      });
    } catch (err) {
      console.warn("IndexedDB unavailable, using in-memory storage", err);
      return null;
    }
  })();
  return dbPromise;
}

export async function isPersistent(): Promise<boolean> {
  return (await getDB()) !== null;
}

export async function saveExercise(ex: Exercise): Promise<void> {
  const next = { ...ex, updatedAt: Date.now() };
  const db = await getDB();
  if (!db) {
    memExercises.set(ex.id, next);
    return;
  }
  await db.put("exercises", next);
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const db = await getDB();
  if (!db) return memExercises.get(id) ?? null;
  return (await db.get("exercises", id)) ?? null;
}

export async function listExercises(): Promise<Exercise[]> {
  const db = await getDB();
  const all = db ? await db.getAll("exercises") : [...memExercises.values()];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteExercise(id: string): Promise<void> {
  sessionAudio.delete(id);
  const db = await getDB();
  if (!db) {
    memExercises.delete(id);
    memAudio.delete(id);
    return;
  }
  const tx = db.transaction(["exercises", "audio"], "readwrite");
  await Promise.all([tx.objectStore("exercises").delete(id), tx.objectStore("audio").delete(id), tx.done]);
}

/**
 * Try to persist audio. Returns true when stored durably. Checks the storage
 * estimate first and treats quota errors as a normal "not stored" outcome.
 */
export async function saveAudio(id: string, blob: Blob, name: string): Promise<boolean> {
  sessionAudio.set(id, blob);
  const db = await getDB();
  if (!db) return false;
  try {
    if (navigator.storage?.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota !== undefined && usage !== undefined && quota - usage < blob.size * 1.5) return false;
    }
    await db.put("audio", { id, blob, name, type: blob.type, savedAt: Date.now() });
    // Ask the browser not to evict our data under pressure (best effort).
    void navigator.storage?.persist?.().catch(() => false);
    return true;
  } catch (err) {
    console.warn("Could not store audio locally", err);
    return false;
  }
}

/** Audio for an exercise from this session's memory, then IndexedDB. */
export async function getAudio(id: string): Promise<Blob | null> {
  const mem = sessionAudio.get(id);
  if (mem) return mem;
  const db = await getDB();
  const rec = db ? await db.get("audio", id) : memAudio.get(id);
  if (rec?.blob) {
    sessionAudio.set(id, rec.blob);
    return rec.blob;
  }
  return null;
}

/** Attach audio for the current session only (used when re-uploading a file that could not be stored). */
export function attachSessionAudio(id: string, blob: Blob) {
  sessionAudio.set(id, blob);
}
