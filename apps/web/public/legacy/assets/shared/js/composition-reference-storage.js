const DB_NAME = "coo_particles_composition_reference_v1";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";

let dbPromise = null;

function getIndexedDb() {
    try {
        return globalThis.indexedDB || null;
    } catch {
        return null;
    }
}

export function openCompositionReferenceDb() {
    if (dbPromise) return dbPromise;
    const indexedDb = getIndexedDb();
    if (!indexedDb) return Promise.reject(new Error("IndexedDB unavailable"));
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
    }).catch((error) => {
        dbPromise = null;
        throw error;
    });
    return dbPromise;
}

export async function putCompositionReferenceSnapshot(key, snapshot) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) throw new Error("Composition reference snapshot key is empty");
    const db = await openCompositionReferenceDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(STORE_NAME).put({ key: normalizedKey, ...snapshot });
    });
}

export async function getCompositionReferenceSnapshot(key) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return null;
    const db = await openCompositionReferenceDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(normalizedKey);
        request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
        request.onsuccess = () => resolve(request.result || null);
    });
}

export async function deleteCompositionReferenceSnapshot(key) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const db = await openCompositionReferenceDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB delete failed"));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(STORE_NAME).delete(normalizedKey);
    });
}
