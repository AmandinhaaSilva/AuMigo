import { isSafeDocumentId } from "./adoptions-data.js";

const PREFIX = "aufriends.adoptionAttempt.v1";

export function createAdoptionAttemptStore(storage, animalId, createId = () => crypto.randomUUID()) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("sessionStorage é obrigatório.");
  }
  if (!isSafeDocumentId(animalId)) throw new TypeError("Animal inválido.");

  const key = `${PREFIX}:${animalId}`;

  function write(record) {
    storage.setItem(key, JSON.stringify(record));
    return Object.freeze({ ...record });
  }

  function fresh() {
    const id = createId();
    if (!isSafeDocumentId(id)) throw new TypeError("Identificador de tentativa inválido.");
    return write({ id, completed: false });
  }

  function read() {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null");
      if (isSafeDocumentId(parsed?.id) && typeof parsed.completed === "boolean") {
        return Object.freeze({ id: parsed.id, completed: parsed.completed });
      }
    } catch {
      // Um valor de sessão corrompido é substituído por uma tentativa segura.
    }
    return fresh();
  }

  let record = read();

  return Object.freeze({
    get current() {
      return record;
    },
    markCompleted() {
      record = write({ id: record.id, completed: true });
      return record;
    },
    reset() {
      record = fresh();
      return record;
    }
  });
}
