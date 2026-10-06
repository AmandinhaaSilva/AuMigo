import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "firebase/storage";

const REMOTE_MEDIA_ORIGIN = "https://aufriends-media-api.aufriends.workers.dev";

function encodedPath(path) {
  return String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function mediaError(message, status) {
  const error = new Error(message);
  error.code = status === 404
    ? "storage/object-not-found"
    : status === 401 || status === 403
      ? "storage/unauthorized"
      : status === 413
        ? "storage/quota-exceeded"
        : status === 415
          ? "storage/invalid-format"
          : status >= 500
            ? "storage/unavailable"
            : "storage/unknown";
  error.service = "media";
  error.status = status;
  return error;
}

function firebaseStorageGateway(storage) {
  return Object.freeze({
    getUrl(path) {
      return getDownloadURL(ref(storage, path));
    },
    upload(path, bytes, contentType) {
      return uploadBytes(ref(storage, path), bytes, { contentType });
    },
    remove(path) {
      return deleteObject(ref(storage, path));
    }
  });
}

function remoteR2Gateway(auth) {
  async function adminRequest(path, init) {
    const user = auth.currentUser;
    if (!user) throw mediaError("Administrador não autenticado.", 401);
    const idToken = await user.getIdToken();
    let response;

    try {
      response = await fetch(
        `${REMOTE_MEDIA_ORIGIN}/admin/media/${encodedPath(path)}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${idToken}`,
            ...(init.headers ?? {})
          }
        }
      );
    } catch {
      throw mediaError("Serviço de imagens indisponível.", 503);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw mediaError(body.error ?? "Falha ao atualizar a imagem.", response.status);
    }
    return response;
  }

  return Object.freeze({
    getUrl(path) {
      return Promise.resolve(`${REMOTE_MEDIA_ORIGIN}/media/${encodedPath(path)}`);
    },
    async upload(path, bytes, contentType) {
      const response = await adminRequest(path, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes
      });
      return response.json();
    },
    async remove(path) {
      await adminRequest(path, { method: "DELETE" });
    }
  });
}

export function createCatalogMediaGateway({ auth, storage, useEmulators }) {
  if (!auth || !storage) throw new TypeError("Auth e Storage são obrigatórios.");
  return useEmulators ? firebaseStorageGateway(storage) : remoteR2Gateway(auth);
}

export function asCatalogMedia(value) {
  if (value?.getUrl && value?.upload && value?.remove) return value;
  if (value) return firebaseStorageGateway(value);
  throw new TypeError("Gateway de mídia obrigatório.");
}
