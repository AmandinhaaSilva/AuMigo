import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_GROUPS = Object.freeze([
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%&*+-_"
]);
const PASSWORD_ALPHABET = PASSWORD_GROUPS.join("");

function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function secureTemporaryPassword() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Não foi possível gerar uma credencial temporária segura.");
  }

  const bytes = new Uint8Array(64);
  cryptoApi.getRandomValues(bytes);
  let cursor = 0;
  const characters = PASSWORD_GROUPS.map(
    (group) => group[bytes[cursor++] % group.length]
  );

  while (characters.length < 32) {
    characters.push(PASSWORD_ALPHABET[bytes[cursor++] % PASSWORD_ALPHABET.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = bytes[cursor++] % (index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }

  return characters.join("");
}

function secondaryAppName() {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `aufriends-admin-invite-${suffix}`;
}

function adminRecord(snapshot) {
  const data = snapshot.data();
  return Object.freeze({
    uid: snapshot.id,
    displayName: normalizedText(data.displayName) || "Administrador",
    email: String(data.email ?? "").trim().toLowerCase(),
    active: data.active === true,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null
  });
}

export function normalizeAdminInvitation(input = {}) {
  const values = Object.freeze({
    displayName: normalizedText(input.displayName),
    email: String(input.email ?? "").trim().toLowerCase()
  });
  const errors = {};

  if (values.displayName.length < 2 || values.displayName.length > 120) {
    errors.displayName = "Informe um nome com 2 a 120 caracteres.";
  }
  if (
    values.email.length < 5
    || values.email.length > 254
    || !EMAIL_PATTERN.test(values.email)
  ) {
    errors.email = "Informe um e-mail válido.";
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    values,
    errors: Object.freeze(errors)
  });
}

export function adminInvitationErrorMessage(error) {
  if (["auth/invalid-credential", "auth/wrong-password"].includes(error?.code)) {
    return "A senha atual está incorreta.";
  }
  if (error?.code === "auth/email-already-in-use") {
    return "Este e-mail já possui uma conta. Use outro endereço ou o procedimento administrativo para promover a conta existente.";
  }
  if (error?.code === "auth/invalid-email") {
    return "O endereço de e-mail é inválido.";
  }
  if (error?.code === "auth/operation-not-allowed") {
    return "A criação de contas por e-mail está indisponível no Firebase.";
  }
  if (error?.code === "auth/too-many-requests") {
    return "Muitos convites foram solicitados. Aguarde um pouco e tente novamente.";
  }
  if (error?.code === "auth/network-request-failed") {
    return "Não foi possível acessar o serviço de autenticação. Confira a conexão.";
  }
  if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
    return "Sua conta não possui mais permissão para conceder acesso administrativo.";
  }
  if (error instanceof AggregateError) {
    return "O convite falhou e a conta temporária pode exigir conferência manual.";
  }
  return "Não foi possível adicionar o administrador agora. Tente novamente.";
}

export function createAdminManagementService({
  app,
  auth,
  firestore,
  authEmulatorUrl = null
}) {
  if (!app || !auth || !firestore) {
    throw new TypeError("App, Auth e Firestore são obrigatórios.");
  }

  async function listAdmins() {
    const snapshot = await getDocs(collection(firestore, "admins"));
    return snapshot.docs
      .map(adminRecord)
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        return (left.displayName || left.email).localeCompare(
          right.displayName || right.email,
          "pt-BR",
          { sensitivity: "base" }
        );
      });
  }

  async function inviteAdmin(inviterUid, input) {
    const normalized = normalizeAdminInvitation(input);
    if (!normalized.valid) {
      throw new TypeError("Convite administrativo inválido.");
    }
    if (!inviterUid || auth.currentUser?.uid !== inviterUid) {
      throw new Error("Sessão administrativa obrigatória.");
    }

    const invitedApp = initializeApp(app.options, secondaryAppName());
    const invitedAuth = getAuth(invitedApp);
    let invitedUser = null;

    try {
      if (authEmulatorUrl) {
        connectAuthEmulator(invitedAuth, authEmulatorUrl, { disableWarnings: true });
      }
      await setPersistence(invitedAuth, inMemoryPersistence);

      const temporaryPassword = secureTemporaryPassword();
      const credential = await createUserWithEmailAndPassword(
        invitedAuth,
        normalized.values.email,
        temporaryPassword
      );
      invitedUser = credential.user;
      await updateProfile(invitedUser, { displayName: normalized.values.displayName });
      await sendPasswordResetEmail(invitedAuth, normalized.values.email);
      await setDoc(doc(firestore, "admins", invitedUser.uid), {
        schemaVersion: 1,
        displayName: normalized.values.displayName,
        email: normalized.values.email,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: inviterUid,
        updatedBy: inviterUid
      });

      return Object.freeze({
        uid: invitedUser.uid,
        displayName: normalized.values.displayName,
        email: normalized.values.email,
        active: true
      });
    } catch (error) {
      if (invitedUser) {
        try {
          await deleteUser(invitedUser);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "O convite falhou e a conta temporária não pôde ser removida."
          );
        }
      }
      throw error;
    } finally {
      await signOut(invitedAuth).catch(() => {});
      await deleteApp(invitedApp).catch(() => {});
    }
  }

  return Object.freeze({ listAdmins, inviteAdmin });
}
