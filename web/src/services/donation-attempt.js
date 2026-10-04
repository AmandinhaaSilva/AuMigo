import { isSafeDonationId } from "./donations-data.js";

const KEY = "aufriends.donationAttempt.v1";

export function createDonationAttemptStore(storage, createId = () => crypto.randomUUID()) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("sessionStorage é obrigatório.");
  }

  function write(record) {
    storage.setItem(KEY, JSON.stringify(record));
    return Object.freeze({ ...record });
  }

  function fresh() {
    const id = createId();
    if (!isSafeDonationId(id)) throw new TypeError("Identificador de tentativa inválido.");
    return write({ id, completed: false });
  }

  function read() {
    try {
      const parsed = JSON.parse(storage.getItem(KEY) ?? "null");
      if (isSafeDonationId(parsed?.id) && typeof parsed.completed === "boolean") {
        return Object.freeze({ id: parsed.id, completed: parsed.completed });
      }
    } catch {
      // Um valor corrompido é substituído por uma tentativa segura.
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
    }
  });
}
