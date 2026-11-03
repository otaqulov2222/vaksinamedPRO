import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, ScanFace } from "lucide-react";
import { request } from "./api";

type LoginUser = { id: number; email: string; name: string; role: string; branchId: number | null };

type WebauthnBundle = {
  rpId: string | null;
  origin: string | null;
  creation: Record<string, unknown> | null;
  request: Record<string, unknown> | null;
};

type PendingLogin = {
  status: "WEBAUTHN_REQUIRED" | "WEBAUTHN_ENROLL";
  ticket: string;
  user: LoginUser;
  webauthn: WebauthnBundle;
};

function b64urlToBuf(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function webauthnAvailable(): boolean {
  return typeof window !== "undefined"
    && window.isSecureContext
    && typeof PublicKeyCredential !== "undefined"
    && typeof navigator.credentials?.create === "function";
}

function hydrateCreation(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const raw = options as {
    challenge: string;
    rp: PublicKeyCredentialCreationOptions["rp"];
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: PublicKeyCredentialCreationOptions["pubKeyCredParams"];
    authenticatorSelection?: PublicKeyCredentialCreationOptions["authenticatorSelection"];
    timeout?: number;
    attestation?: AttestationConveyancePreference;
    excludeCredentials?: Array<{ type: "public-key"; id: string; transports?: AuthenticatorTransport[] }>;
  };
  return {
    challenge: b64urlToBuf(raw.challenge),
    rp: raw.rp,
    user: {
      id: b64urlToBuf(raw.user.id),
      name: raw.user.name,
      displayName: raw.user.displayName,
    },
    pubKeyCredParams: raw.pubKeyCredParams,
    authenticatorSelection: raw.authenticatorSelection,
    timeout: raw.timeout,
    attestation: raw.attestation,
    excludeCredentials: (raw.excludeCredentials || []).map((item) => ({
      type: "public-key" as const,
      id: b64urlToBuf(item.id),
      transports: item.transports,
    })),
  };
}

function hydrateRequest(options: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const raw = options as {
    challenge: string;
    rpId?: string;
    allowCredentials: Array<{ type: "public-key"; id: string; transports?: AuthenticatorTransport[] }>;
    userVerification?: UserVerificationRequirement;
    timeout?: number;
  };
  return {
    challenge: b64urlToBuf(raw.challenge),
    rpId: raw.rpId,
    allowCredentials: (raw.allowCredentials || []).map((item) => ({
      type: "public-key" as const,
      id: b64urlToBuf(item.id),
      transports: item.transports,
    })),
    userVerification: raw.userVerification,
    timeout: raw.timeout,
  };
}

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingLogin | null>(null);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/admin/login", null, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (data.ticket && (data.status === "WEBAUTHN_REQUIRED" || data.status === "WEBAUTHN_ENROLL")) {
        setPending(data as PendingLogin);
        return;
      }
      if (data.token) {
        throw new Error("Paroldan keyin Face ID majburiy");
      }
      throw new Error("Kirish javobi kutilmagan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirish xatosi");
    } finally {
      setBusy(false);
    }
  }

  async function reenrollOnThisDevice() {
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/admin/login", null, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password, resetWebauthn: true }),
      });
      if (data.ticket && data.status === "WEBAUTHN_ENROLL") {
        setPending(data as PendingLogin);
        return;
      }
      throw new Error("Qayta bog‘lash uchun yangi Face ID kaliti ochilmadi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qayta bog‘lash xatosi");
    } finally {
      setBusy(false);
    }
  }

  async function completeBiometric(body: Record<string, unknown>) {
    if (!pending) return;
    const data = await request("/api/admin/login/biometric", null, {
      method: "POST",
      body: JSON.stringify({ ticket: pending.ticket, ...body }),
    });
    if (!data.token) throw new Error("Sessiya ochilmadi");
    onAuthenticated(data.token);
  }

  async function runWebauthn() {
    if (!pending) return;
    setError("");
    setBusy(true);
    try {
      if (!webauthnAvailable()) {
        throw new Error("SECURE_CONTEXT");
      }
      if (pending.status === "WEBAUTHN_ENROLL" && pending.webauthn.creation) {
        const cred = await navigator.credentials.create({
          publicKey: hydrateCreation(pending.webauthn.creation),
        }) as PublicKeyCredential;
        const att = cred.response as AuthenticatorAttestationResponse;
        const publicKey = att.getPublicKey?.();
        if (!publicKey) throw new Error("Face ID kaliti olinmadi");
        await completeBiometric({
          method: "webauthn",
          id: bufToB64url(cred.rawId),
          clientDataJSON: bufToB64url(att.clientDataJSON),
          authenticatorData: bufToB64url(att.getAuthenticatorData()),
          publicKey: bufToB64url(publicKey),
          transports: att.getTransports?.() || ["internal"],
        });
        return;
      }
      if (pending.status === "WEBAUTHN_REQUIRED" && pending.webauthn.request) {
        const assertion = await navigator.credentials.get({
          publicKey: hydrateRequest(pending.webauthn.request),
        }) as PublicKeyCredential;
        const res = assertion.response as AuthenticatorAssertionResponse;
        await completeBiometric({
          method: "webauthn",
          id: bufToB64url(assertion.rawId),
          clientDataJSON: bufToB64url(res.clientDataJSON),
          authenticatorData: bufToB64url(res.authenticatorData),
          signature: bufToB64url(res.signature),
        });
        return;
      }
      throw new Error("SECURE_CONTEXT");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Face ID xatosi";
      if (message === "SECURE_CONTEXT" || /secure context|https|publickeycredential|rpid/i.test(message)) {
        setError("Face ID faqat HTTPS da ishlaydi. http://IP orqali yuzsiz kirib bo‘lmaydi.");
      } else if ((err as { name?: string }).name === "NotAllowedError") {
        setError("Yuz tasdiqlanmadi. Face ID / Windows Hello ni qayta urinib ko‘ring.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void runWebauthn();
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div className="login-wrap">
      <div className="login-aurora" aria-hidden="true" />
      <section className="login-card" aria-label="Admin kirish">
        <div className="brand">
          <span className="brand-mark">VM</span>
          <span className="brand-text">VAKSINA MED</span>
        </div>
        <h1>Admin panel</h1>
        <p className="muted">{pending ? "Yuzni tasdiqlang" : "Boshqaruv konsoliga kirish"}</p>

        {!pending ? (
          <form className="login-form" onSubmit={submitPassword}>
            <label className="login-field">
              <span>Email yoki login</span>
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="username"
                required
              />
            </label>
            <label className="login-field">
              <span>Parol</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Parol"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPassword((prev) => !prev);
                  }}
                  title={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko‘rsatish"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Tekshirilmoqda…" : "Kirish"}
            </button>
          </form>
        ) : (
          <div className="login-face">
            <div className={`login-scan ${busy ? "scanning" : ""}`}>
              <div className="login-scan-ring" />
              <ScanFace size={42} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <p className="login-face-user">{pending.user.name}</p>
            <p className="login-face-hint">
              {pending.status === "WEBAUTHN_ENROLL"
                ? "Shu kompyuterda Windows Hello / Face ID ni bog‘lang (Edge tavsiya etiladi)"
                : "Faqat oldin bog‘langan Face ID / Windows Hello"}
            </p>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <button className="btn-primary" type="button" disabled={busy} onClick={() => void runWebauthn()}>
              {busy ? "Kutilmoqda…" : pending.status === "WEBAUTHN_ENROLL" ? "Windows Hello bilan bog‘lash" : "Face ID bilan tasdiqlash"}
            </button>
            {pending.status === "WEBAUTHN_REQUIRED" ? (
              <button
                className="login-text-btn"
                type="button"
                disabled={busy || !password}
                onClick={() => void reenrollOnThisDevice()}
              >
                Bu kompyuterda yangi Face ID bog‘lash
              </button>
            ) : null}
            <button
              className="login-text-btn"
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setError("");
              }}
            >
              Orqaga
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
