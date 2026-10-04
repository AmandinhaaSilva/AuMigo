const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_PATH = /^public\/(animals|products)\/([A-Za-z0-9_-]{1,128})\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|jpeg|png|webp)$/;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function adminCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin"
  };
}

function mediaKey(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);

  try {
    const decoded = decodeURIComponent(encoded);
    return MEDIA_PATH.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function normalizedContentType(request) {
  return String(request.headers.get("Content-Type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function matchesImageSignature(bytes, extension, contentType) {
  if (extension === "jpg" || extension === "jpeg") {
    return contentType === "image/jpeg"
      && bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;
  }

  if (extension === "png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return contentType === "image/png"
      && bytes.length >= signature.length
      && signature.every((value, index) => bytes[index] === value);
  }

  if (extension === "webp") {
    return contentType === "image/webp"
      && bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }

  return false;
}

async function activeAdmin(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) return null;
  const idToken = match[1];

  const lookupResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!lookupResponse.ok) return null;
  const lookup = await lookupResponse.json();
  const uid = lookup.users?.[0]?.localId;
  if (!uid) return null;

  const adminResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/admins/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );

  if (!adminResponse.ok) return null;
  const adminDocument = await adminResponse.json();
  return adminDocument.fields?.active?.booleanValue === true ? uid : null;
}

async function servePublicMedia(request, env, key) {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff"
  });

  if (request.method === "HEAD") {
    const object = await env.AUFRIENDS_MEDIA.head(key);
    if (!object) return new Response(null, { status: 404, headers });
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("ETag", object.httpEtag);
    headers.set("Content-Length", String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.AUFRIENDS_MEDIA.get(key);
  if (!object) return new Response("Imagem não encontrada.", { status: 404, headers });
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

async function uploadMedia(request, env, key, corsHeaders) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    return json({ error: "A imagem deve ter no máximo 5 MB." }, 413, corsHeaders);
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    return json({ error: "Arquivo vazio ou acima do limite de 5 MB." }, 413, corsHeaders);
  }

  const extension = MEDIA_PATH.exec(key)?.[4];
  const contentType = normalizedContentType(request);
  if (!extension || !matchesImageSignature(body, extension, contentType)) {
    return json({ error: "O conteúdo do arquivo não corresponde a JPEG, PNG ou WebP válido." }, 415, corsHeaders);
  }

  await env.AUFRIENDS_MEDIA.put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: { uploadedBy: "firebase-admin" }
  });

  const publicUrl = new URL(`/media/${key}`, request.url).toString();
  return json({ path: key, url: publicUrl }, 201, corsHeaders);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const corsHeaders = adminCorsHeaders(request, env);
      return corsHeaders
        ? new Response(null, { status: 204, headers: corsHeaders })
        : json({ error: "Origem não autorizada." }, 403);
    }

    const publicKey = mediaKey(url.pathname, "/media/");
    if (publicKey && ["GET", "HEAD"].includes(request.method)) {
      return servePublicMedia(request, env, publicKey);
    }

    const adminKey = mediaKey(url.pathname, "/admin/media/");
    if (adminKey && ["PUT", "DELETE"].includes(request.method)) {
      const corsHeaders = adminCorsHeaders(request, env);
      if (!corsHeaders) return json({ error: "Origem não autorizada." }, 403);

      const uid = await activeAdmin(request, env);
      if (!uid) return json({ error: "Administrador não autorizado." }, 403, corsHeaders);

      if (request.method === "DELETE") {
        await env.AUFRIENDS_MEDIA.delete(adminKey);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      return uploadMedia(request, env, adminKey, corsHeaders);
    }

    return json({ error: "Rota não encontrada." }, 404);
  }
};
