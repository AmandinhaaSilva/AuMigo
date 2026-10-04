export const CART_STORAGE_KEY = "aufriends.cart.v1";
export const CART_CHANGE_EVENT = "aufriends:cart-changed";
export const MAX_CART_QUANTITY = 99;

const SAFE_PRODUCT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class CartValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CartValidationError";
  }
}

export function isSafeProductId(value) {
  return typeof value === "string" && SAFE_PRODUCT_ID.test(value);
}

function cloneItems(items) {
  return Object.freeze(items.map(({ productId, quantity }) =>
    Object.freeze({ productId, quantity })
  ));
}

export function sanitizeCartItems(value) {
  if (!Array.isArray(value)) return Object.freeze([]);

  const quantities = new Map();
  for (const item of value) {
    if (!isSafeProductId(item?.productId)) continue;
    if (!Number.isSafeInteger(item?.quantity) || item.quantity < 1 || item.quantity > MAX_CART_QUANTITY) {
      continue;
    }
    const current = quantities.get(item.productId) ?? 0;
    quantities.set(item.productId, Math.min(MAX_CART_QUANTITY, current + item.quantity));
  }

  return cloneItems(
    [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
  );
}

function parseStoredItems(serialized) {
  try {
    return sanitizeCartItems(JSON.parse(serialized ?? "[]"));
  } catch {
    return Object.freeze([]);
  }
}

function serializedItems(items) {
  return JSON.stringify(items.map(({ productId, quantity }) => ({ productId, quantity })));
}

function requireProductId(productId) {
  if (!isSafeProductId(productId)) throw new CartValidationError("Produto inválido.");
}

function requireQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
    throw new CartValidationError("A quantidade deve ser um número inteiro entre 1 e 99.");
  }
}

function createChangeEvent(detail) {
  if (typeof CustomEvent === "function") {
    return new CustomEvent(CART_CHANGE_EVENT, { detail });
  }
  if (typeof Event === "function") {
    const event = new Event(CART_CHANGE_EVENT);
    Object.defineProperty(event, "detail", { value: detail });
    return event;
  }
  return null;
}

function memoryStorage() {
  const values = new Map();
  return Object.freeze({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  });
}

export function createCartStore(storage, eventTarget = null) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("localStorage é obrigatório.");
  }

  const listeners = new Set();
  const initialValue = storage.getItem(CART_STORAGE_KEY);
  let items = parseStoredItems(initialValue);
  const initialCanonical = serializedItems(items);
  if (initialValue !== initialCanonical) storage.setItem(CART_STORAGE_KEY, initialCanonical);

  function detail(source) {
    return Object.freeze({
      source,
      items: cloneItems(items),
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0)
    });
  }

  function emit(source) {
    const nextDetail = detail(source);
    for (const listener of listeners) listener(nextDetail);
    const event = createChangeEvent(nextDetail);
    if (event && typeof eventTarget?.dispatchEvent === "function") eventTarget.dispatchEvent(event);
  }

  function write(nextItems, source = "local") {
    const sanitized = sanitizeCartItems(nextItems);
    const nextValue = serializedItems(sanitized);
    if (nextValue === serializedItems(items)) return false;
    storage.setItem(CART_STORAGE_KEY, nextValue);
    items = sanitized;
    emit(source);
    return true;
  }

  function onStorage(event) {
    if (event?.key !== CART_STORAGE_KEY) return;
    const nextItems = parseStoredItems(event.newValue);
    const canonical = serializedItems(nextItems);
    if (canonical !== (event.newValue ?? "[]")) storage.setItem(CART_STORAGE_KEY, canonical);
    if (canonical === serializedItems(items)) return;
    items = nextItems;
    emit("storage");
  }

  eventTarget?.addEventListener?.("storage", onStorage);

  function add(productId, quantity = 1) {
    requireProductId(productId);
    requireQuantity(quantity);
    const current = items.find((item) => item.productId === productId);
    if (current) {
      return write(items.map((item) => item.productId === productId
        ? { productId, quantity: Math.min(MAX_CART_QUANTITY, item.quantity + quantity) }
        : item));
    }
    return write([...items, { productId, quantity }]);
  }

  return Object.freeze({
    getItems() {
      return cloneItems(items);
    },
    getTotalQuantity() {
      return items.reduce((sum, item) => sum + item.quantity, 0);
    },
    add,
    increment(productId) {
      return add(productId, 1);
    },
    decrement(productId) {
      requireProductId(productId);
      const current = items.find((item) => item.productId === productId);
      if (!current || current.quantity === 1) return false;
      return write(items.map((item) => item.productId === productId
        ? { productId, quantity: item.quantity - 1 }
        : item));
    },
    setQuantity(productId, quantity) {
      requireProductId(productId);
      requireQuantity(quantity);
      if (!items.some((item) => item.productId === productId)) return false;
      return write(items.map((item) => item.productId === productId
        ? { productId, quantity }
        : item));
    },
    remove(productId) {
      requireProductId(productId);
      return write(items.filter((item) => item.productId !== productId));
    },
    removeMany(productIds) {
      const ids = new Set(productIds);
      for (const productId of ids) requireProductId(productId);
      return write(items.filter((item) => !ids.has(item.productId)));
    },
    clear() {
      return write([]);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Listener inválido.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      listeners.clear();
      eventTarget?.removeEventListener?.("storage", onStorage);
    }
  });
}

export function reconcileCartItems(items, availableProductIds) {
  const sanitized = sanitizeCartItems(items);
  const available = availableProductIds instanceof Set
    ? availableProductIds
    : new Set(availableProductIds);
  const kept = sanitized.filter(({ productId }) => available.has(productId));
  const removed = sanitized.filter(({ productId }) => !available.has(productId));
  return Object.freeze({ kept: cloneItems(kept), removed: cloneItems(removed) });
}

export function calculateCartTotalCents(items, productsById) {
  const sanitized = sanitizeCartItems(items);
  let total = 0;
  for (const item of sanitized) {
    const product = productsById instanceof Map
      ? productsById.get(item.productId)
      : productsById?.[item.productId];
    if (!product || !Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
      throw new CartValidationError("O carrinho contém um produto indisponível.");
    }
    const subtotal = product.priceCents * item.quantity;
    if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) {
      throw new CartValidationError("Não foi possível calcular o total com segurança.");
    }
    total += subtotal;
  }
  return total;
}

function createDefaultCartStore() {
  const eventTarget = typeof window === "undefined" ? null : window;
  try {
    if (globalThis.localStorage) return createCartStore(globalThis.localStorage, eventTarget);
  } catch {
    // Navegadores que bloqueiam localStorage usam memória somente nesta página.
  }
  return createCartStore(memoryStorage(), eventTarget);
}

export const cartStore = createDefaultCartStore();
