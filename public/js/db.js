/**
 * 지난 서류 다시 보기 — IndexedDB (분석 결과 텍스트만 저장, 사진 원본 미저장)
 * "내 기록은 내 휴대폰에만 보관됩니다"
 */

const DB_NAME = 'hyojason';
const STORE = 'records';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export async function addRecord(result) {
  const db = await open();
  return tx(db, 'readwrite', (s) => s.add({
    date: new Date().toISOString(),
    문서종류: result.문서종류 || '서류',
    위험도: result.위험도 || '주의',
    result,
  }));
}

export async function listRecords() {
  const db = await open();
  const items = await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function deleteRecord(id) {
  const db = await open();
  return tx(db, 'readwrite', (s) => s.delete(id));
}

export async function clearRecords() {
  const db = await open();
  return tx(db, 'readwrite', (s) => s.clear());
}
