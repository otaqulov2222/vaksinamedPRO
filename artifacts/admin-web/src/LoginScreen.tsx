import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ScanFace, ShieldCheck } from "lucide-react";
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
  const [faceHint, setFaceHint] = useState("Qurilma Face ID / Windows Hello so‘raydi");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => () => stopCamera(), []);

  async function finishWithToken(token: string) {
    stopCamera();
    onAuthenticated(token);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await request("/api/admin/login", null, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (data.token) {
        await finishWithToken(data.token);
        return;
      }
      if (data.ticket && (data.status === "WEBAUTHN_REQUIRED" || data.status === "WEBAUTHN_ENROLL")) {
        setPending(data as PendingLogin);
        setFaceHint(data.status === "WEBAUTHN_ENROLL"
          ? "Birinchi marta: Face ID ni ushbu qurilmaga bog‘lang"
          : "Yuz yoki barmoq izi bilan tasdiqlang");
        return;
      }
      throw new Error("Kirish javobi kutilmagan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirish xatosi");
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
    await finishWithToken(data.token);
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
        setFaceHint("Yuzingizni kameraga tuting — qurilma kalit yaratadi");
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
        setFaceHint("Face ID yoki Windows Hello ni tasdiqlang");
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
      if (message === "SECURE_CONTEXT" || /secure context|https|publickeycredential/i.test(message)) {
        setFaceHint("HTTPS yo‘q — kameradan jonli tasdiqlash");
        await startCameraFallback();
      } else if ((err as { name?: string }).name === "NotAllowedError") {
        setError("Face ID bekor qilindi. Qayta urinib ko‘ring.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startCameraFallback() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setFaceHint("Yuzingiz kadirda bo‘lsin, keyin tasdiqlang");
    } catch {
      setFaceHint("Kamera ochilmadi — shu qurilmadan tasdiqlang");
    }
  }

  async function confirmFace() {
    setError("");
    setBusy(true);
    try {
      await completeBiometric({ method: "face", presenceConfirmed: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tasdiqlash xatosi");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void runWebauthn();
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div className="login-wrap">
      <div className="login-aurora" aria-hidden="true" />
      <div className="login-shell">
        <aside className="login-hero" aria-hidden="true">
          <div className="login-hero-badge">VM</div>
          <p className="login-hero-kicker">Vaksina Med</p>
          <h2>Boshqaruv faqat tasdiqlangan operatorlarga</h2>
          <p>Avval parol. Keyin shu qurilmadagi Face ID, Windows Hello yoki jonli yuz tasdiqlovi.</p>
          <ul>
            <li>Sessiya paroldan keyin ochilmaydi</li>
            <li>Ticket 2 daqiqada yonadi</li>
            <li>Platforma biometriyasi — yuz rasmi saqlanmaydi</li>
          </ul>
        </aside>

        <section className="login-card" aria-label="Admin kirish">
          <div className="brand">
            <span className="brand-mark">VM</span>
            <span className="brand-text">VAKSINA MED</span>
          </div>
          <h1>Admin panel</h1>
          <p className="muted">{pending ? "Ikkinchi qadam — yuzni tasdiqlash" : "Boshqaruv konsoliga xavfsiz kirish"}</p>

          <ol className="login-steps" aria-label="Kirish qadamlari">
            <li className={pending ? "done" : "active"}><span>1</span> Parol</li>
            <li className={pending ? "active" : ""}><span>2</span> Face ID</li>
          </ol>

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
                {busy ? "Tekshirilmoqda…" : "Davom etish"}
              </button>
              <p className="login-fineprint">
                <ShieldCheck size={14} aria-hidden="true" />
                Keyingi oynada Face ID so‘raladi. Yuz rasmi serverga yuborilmaydi.
              </p>
            </form>
          ) : (
            <div className="login-face">
              <div className={`login-scan ${busy ? "scanning" : ""}`}>
                <video ref={videoRef} className="login-scan-video" playsInline muted autoPlay />
                <div className="login-scan-ring" />
                <ScanFace size={42} strokeWidth={1.6} aria-hidden="true" />
              </div>
              <p className="login-face-user">{pending.user.name}</p>
              <p className="login-face-hint">{faceHint}</p>
              {error ? <div className="login-error" role="alert">{error}</div> : null}
              <button className="btn-primary" type="button" disabled={busy} onClick={() => void runWebauthn()}>
                {busy ? "Kutilmoqda…" : "Face ID ni ochish"}
              </button>
              <button className="login-secondary" type="button" disabled={busy} onClick={() => void confirmFace()}>
                Kameradan yuzni tasdiqlash
              </button>
              <button
                className="login-text-btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  stopCamera();
                  setPending(null);
                  setError("");
                }}
              >
                Boshqa hisob
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
