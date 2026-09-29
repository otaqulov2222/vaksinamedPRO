import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Check, CheckCircle2, RefreshCw, ScanLine, Undo2, X } from "lucide-react";
import type { ApiError } from "./api";
import { ConfirmDialog, StatusBadge } from "./ui";

type Props = {
  token: string;
  branches: any[];
  defaultBranchId?: number | null;
  operatorName?: string;
  request: (path: string, token: string | null, init?: RequestInit) => Promise<any>;
  money: (n: number) => string;
};

type StepState = "idle" | "active" | "done";
type LoadState = "idle" | "loading" | "ready" | "error";
type Notice = { tone: "ok" | "err"; text: string } | null;

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000, 250000, 500000];

function groupDigits(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Server messages are operator Uzbek for domain errors; anything technical falls back to action copy. */
function operatorMessage(err: unknown, fallback: string) {
  const e = err as ApiError;
  if (e?.code === "INSUFFICIENT_CASHBACK") return "Cashback balansi yetarli emas.";
  if (e?.code === "SPEND_CAP_ZERO") return "Bu xaridda cashback ishlatib bo‘lmaydi.";
  const status = Number(e?.status) || 0;
  if (!status) return "Server bilan aloqa yo‘q. Internetni tekshirib, qayta urinib ko‘ring.";
  if (status === 401) return "Sessiya muddati tugagan. Tizimga qayta kiring.";
  if (status === 429) return "Juda ko‘p urinish. Biroz kutib, qayta urinib ko‘ring.";
  if (status >= 500) return fallback;
  const msg = String(e?.message || "").trim();
  if (!msg || /HTTP \d|[A-Z_]{4,}|\bUSE\b|sourceKey|customerId|Ledger/.test(msg)) return fallback;
  return msg;
}

function PosStep(props: { n: number; title: string; state: StepState; aside?: ReactNode; children: ReactNode }) {
  return (
    <li className={`pos-step is-${props.state}`} aria-current={props.state === "active" ? "step" : undefined}>
      <div className="pos-step-head">
        <span className="pos-step-no" aria-hidden="true">
          {props.state === "done" ? <Check size={13} strokeWidth={2.6} /> : props.n}
        </span>
        <h2 className="pos-step-title">{props.title}</h2>
        {props.aside ? <div className="pos-step-aside">{props.aside}</div> : null}
      </div>
      <div className="pos-step-body">{props.children}</div>
    </li>
  );
}

/**
 * POS cashback UX — server remains authoritative.
 * Slider max MUST come from preview.maxSpend (engine clamp), never min(balance, amount).
 */
export function PosTerminal({ token, branches, defaultBranchId, operatorName, request, money }: Props) {
  const scanRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  const [qr, setQr] = useState("");
  const [scannedQr, setScannedQr] = useState("");
  const [scanSource, setScanSource] = useState("");
  const [scanError, setScanError] = useState("");
  const [branchId, setBranchId] = useState<number>(defaultBranchId || branches[0]?.id || 0);
  const [customer, setCustomer] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [cashbackToUse, setCashbackToUse] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [previewState, setPreviewState] = useState<LoadState>("idle");
  const [previewError, setPreviewError] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [sales, setSales] = useState<any[]>([]);
  const [salesState, setSalesState] = useState<LoadState>("loading");
  const [salesError, setSalesError] = useState("");
  const [busy, setBusy] = useState<"lookup" | "sale" | "void" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);

  const branchName = useMemo(
    () => String(branches.find((b) => Number(b.id) === Number(branchId))?.name || ""),
    [branches, branchId],
  );

  async function loadSales() {
    setSalesState((s) => (s === "ready" ? s : "loading"));
    try {
      const data = await request(`/api/pos/sales?branchId=${branchId || ""}&limit=25`, token);
      setSales(data.sales || []);
      setSalesState("ready");
      setSalesError("");
    } catch (err) {
      setSalesState("error");
      setSalesError(operatorMessage(err, "Sotuvlar tarixini yuklab bo‘lmadi."));
    }
  }

  useEffect(() => {
    scanRef.current?.focus();
    void loadSales();
  }, [branchId]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "F2" || document.querySelector(".dialog-root, .drawer-root")) return;
      e.preventDefault();
      scanRef.current?.focus();
      scanRef.current?.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!customer || !scannedQr || !amount) {
      setPreview(null);
      setPreviewState("idle");
      setPreviewError("");
      return;
    }
    let cancelled = false;
    setPreviewState("loading");
    const t = setTimeout(() => {
      void request("/api/pos/preview", token, {
        method: "POST",
        body: JSON.stringify({ qr: scannedQr, amount: Number(amount), cashbackToUse }),
      })
        .then((data) => {
          if (cancelled) return;
          const next = data.preview;
          setPreview(next);
          setPreviewState("ready");
          setPreviewError("");
          // Clamp requested USE to server maxSpend (never imply > policy).
          const serverMax = Math.max(0, Math.floor(Number(next?.maxSpend) || 0));
          if (cashbackToUse > serverMax) {
            setCashbackToUse(serverMax);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewState("error");
          setPreviewError(operatorMessage(err, "Hisoblab bo‘lmadi. Summani tekshirib, qayta urinib ko‘ring."));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customer, scannedQr, amount, cashbackToUse, token]);

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    const code = qr.trim();
    if (!code) return;
    setBusy("lookup");
    setScanError("");
    setNotice(null);
    try {
      const data = await request("/api/pos/lookup", token, {
        method: "POST",
        body: JSON.stringify({ qr: code }),
      });
      setReceipt(null);
      setCustomer(data.customer);
      setScannedQr(code);
      setScanSource(data.scanSource === "signed_qr" ? "Dinamik QR" : "Karta kodi");
      setCashbackToUse(0);
      setQr("");
      requestAnimationFrame(() => amountRef.current?.focus());
    } catch (err) {
      setScanError(operatorMessage(err, "Mijozni topib bo‘lmadi. Kodni qayta skanerlang."));
      scanRef.current?.select();
    } finally {
      setBusy(null);
    }
  }

  async function confirmSale() {
    if (!customer || !preview || previewState !== "ready") return;
    setBusy("sale");
    setNotice(null);
    try {
      const data = await request("/api/pos/sale", token, {
        method: "POST",
        body: JSON.stringify({
          qr: scannedQr,
          amount: Number(amount),
          cashbackToUse,
          branchId,
        }),
      });
      setReceipt(data.receipt);
      setReceiptMessage(data.message || "Sotuv tasdiqlandi");
      setCustomer(null);
      setScannedQr("");
      setScanSource("");
      setAmount("");
      setCashbackToUse(0);
      setPreview(null);
      setQr("");
      await loadSales();
      scanRef.current?.focus();
    } catch (err) {
      setNotice({
        tone: "err",
        text: operatorMessage(
          err,
          "Sotuvni tasdiqlab bo‘lmadi. Qayta urinishdan oldin «So‘nggi sotuvlar» ro‘yxatida chek yozilmaganini tekshiring.",
        ),
      });
      void loadSales();
    } finally {
      setBusy(null);
    }
  }

  async function voidSale(receiptId: string) {
    setBusy("void");
    try {
      await request("/api/pos/void", token, {
        method: "POST",
        body: JSON.stringify({ receiptId }),
      });
      setNotice({ tone: "ok", text: `Chek ${receiptId} bekor qilindi. Cashback harakatlari qaytarildi.` });
      if (receipt?.receiptId === receiptId) setReceipt({ ...receipt, status: "voided" });
      await loadSales();
    } catch (err) {
      setNotice({ tone: "err", text: operatorMessage(err, "Chekni bekor qilib bo‘lmadi. Qayta urinib ko‘ring.") });
    } finally {
      setBusy(null);
      setVoidTarget(null);
    }
  }

  function resetCustomer() {
    setCustomer(null);
    setScannedQr("");
    setScanSource("");
    setPreview(null);
    setReceipt(null);
    setAmount("");
    setCashbackToUse(0);
    setQr("");
    setScanError("");
    setNotice(null);
    scanRef.current?.focus();
  }

  function onAmountKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (canConfirm) payRef.current?.focus();
  }

  /** Authoritative ceiling from preview only — never invent min(balance, amount). */
  const maxSpend = useMemo(() => {
    if (!preview) return 0;
    return Math.max(0, Math.floor(Number(preview.maxSpend) || 0));
  }, [preview]);

  const maxSpendPercent = useMemo(() => {
    const ratio = Number(preview?.maxSpendRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    return Math.round(ratio * 100);
  }, [preview]);

  const spendLabel =
    maxSpendPercent != null
      ? `Server limiti ${maxSpendPercent}%`
      : "Server limiti";

  const previewReady = previewState === "ready" && Boolean(preview);
  const canConfirm = Boolean(customer) && previewReady && !busy;
  const usedNow = Math.min(cashbackToUse, maxSpend);

  const stepCustomer: StepState = customer ? "done" : "active";
  const stepAmount: StepState = !customer ? "idle" : amount ? "done" : "active";
  const stepCashback: StepState = previewReady ? "done" : customer && amount ? "active" : "idle";

  const payHint = !customer
    ? "Avval mijoz QR kodini skanerlang"
    : !amount
      ? "Xarid summasini kiriting"
      : previewState === "loading"
        ? "Hisoblanmoqda…"
        : previewState === "error"
          ? "Summani tuzating"
          : "Yakuniy hisob serverda tasdiqlanadi";

  return (
    <div className="pos-page">
      <header className="page-header pos-header">
        <div className="page-header-text">
          <h1 className="page-title">Kassa POS</h1>
          <p className="page-desc">Mijoz kodi → xarid summasi → cashback → tasdiqlash. Barcha hisob server tomonidan.</p>
        </div>
        <div className="pos-header-meta">
          <label className="pos-branch-field">
            <span className="filter-label">Filial</span>
            <select
              className="pos-branch"
              value={branchId}
              onChange={(e) => setBranchId(Number(e.target.value))}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          {operatorName ? (
            <div className="pos-operator">
              <span className="filter-label">Kassir</span>
              <span className="pos-operator-name">{operatorName}</span>
            </div>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div
          className={`pos-banner ${notice.tone === "err" ? "pos-banner-err" : "pos-banner-ok"}`}
          role={notice.tone === "err" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button type="button" className="btn-tertiary btn-icon pos-banner-close" aria-label="Yopish" onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className="pos-workspace">
        <ol className="pos-steps surface-ops" aria-label="Kassa ish oqimi">
          <PosStep
            n={1}
            title="Mijoz"
            state={stepCustomer}
            aside={scanSource ? <StatusBadge tone="info">{scanSource}</StatusBadge> : null}
          >
            <form onSubmit={lookup} className="pos-scan" role="search">
              <div className="pos-scan-field">
                <ScanLine size={18} className="pos-scan-icon" aria-hidden="true" />
                <input
                  ref={scanRef}
                  value={qr}
                  onChange={(e) => {
                    setQr(e.target.value);
                    if (scanError) setScanError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && qr) {
                      e.preventDefault();
                      setQr("");
                    }
                  }}
                  placeholder={customer ? "Boshqa mijoz kodi" : "QR kod yoki karta raqami"}
                  aria-label="Mijoz QR yoki karta kodi"
                  aria-invalid={scanError ? true : undefined}
                  aria-describedby="pos-scan-hint"
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="pos-kbd" aria-hidden="true">F2</kbd>
              </div>
              <button className="btn-secondary pos-scan-go" type="submit" disabled={busy === "lookup" || !qr.trim()}>
                {busy === "lookup" ? "Qidirilmoqda…" : "Topish"}
              </button>
            </form>
            {scanError ? (
              <p className="pos-field-error" role="alert">{scanError}</p>
            ) : (
              <p className="pos-field-hint" id="pos-scan-hint">
                Skaner kodni Enter bilan yuboradi. Qo‘lda: karta raqami <span className="pos-code">VM-00001234</span> yoki{" "}
                <span className="pos-code">VAKSINA-ID</span>.
              </p>
            )}

            {customer ? (
              <div className="pos-customer">
                <span className="pos-customer-avatar" aria-hidden="true">
                  {String(customer.firstName || customer.name || "?").charAt(0).toUpperCase()}
                </span>
                <div className="pos-customer-id">
                  <div className="pos-name">{customer.name}</div>
                  <div className="pos-customer-meta">
                    <span>{customer.phoneMasked}</span>
                    <span>{customer.cardNumber}</span>
                  </div>
                </div>
                <dl className="pos-stats">
                  <div><dt>Daraja</dt><dd>{customer.tier}</dd></div>
                  <div><dt>Cashback</dt><dd>{customer.cashbackRateLabel}</dd></div>
                  <div><dt>Xaridlar</dt><dd>{customer.purchasesCount}</dd></div>
                </dl>
                <button type="button" className="btn-tertiary pos-customer-reset" onClick={resetCustomer}>
                  Boshqa mijoz
                </button>
              </div>
            ) : null}
          </PosStep>

          <PosStep n={2} title="Xarid summasi" state={stepAmount}>
            <div className={`pos-amount-field${customer ? "" : " is-disabled"}`}>
              <input
                ref={amountRef}
                inputMode="numeric"
                value={groupDigits(amount)}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10))}
                onKeyDown={onAmountKey}
                placeholder="0"
                disabled={!customer}
                className="pos-amount"
                aria-label="Xarid summasi, so‘m"
              />
              <span className="pos-amount-unit" aria-hidden="true">so‘m</span>
            </div>
            <div className="pos-keypad" role="group" aria-label="Tezkor summalar">
              {QUICK_AMOUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`pos-chip${Number(amount) === n ? " is-on" : ""}`}
                  aria-pressed={Number(amount) === n}
                  disabled={!customer}
                  onClick={() => {
                    setAmount(String(n));
                    amountRef.current?.focus();
                  }}
                >
                  {groupDigits(String(n))}
                </button>
              ))}
            </div>
          </PosStep>

          <PosStep n={3} title="Cashback ishlatish" state={stepCashback}>
            {customer ? (
              <div className="pos-spend">
                <dl className="pos-spend-facts">
                  <div><dt>Mavjud balans</dt><dd>{money(customer.balance)}</dd></div>
                  <div>
                    <dt>{spendLabel}</dt>
                    <dd>{preview ? money(maxSpend) : "—"}</dd>
                  </div>
                  <div className="pos-spend-use">
                    <dt>Ishlatiladi</dt>
                    <dd>{usedNow > 0 ? `−${money(usedNow)}` : money(0)}</dd>
                  </div>
                </dl>
                <input
                  type="range"
                  min={0}
                  max={maxSpend || 0}
                  step={1000}
                  value={usedNow}
                  disabled={!preview || maxSpend <= 0}
                  onChange={(e) => setCashbackToUse(Number(e.target.value))}
                  aria-label="Ishlatiladigan cashback"
                  aria-valuetext={money(usedNow)}
                />
                <div className="pos-spend-actions" role="group" aria-label="Cashback miqdori">
                  <button
                    type="button"
                    className={`pos-chip${usedNow === 0 ? " is-on" : ""}`}
                    aria-pressed={usedNow === 0}
                    onClick={() => setCashbackToUse(0)}
                  >
                    Ishlatmaslik
                  </button>
                  <button
                    type="button"
                    className={`pos-chip${maxSpend > 0 && usedNow === maxSpend ? " is-on" : ""}`}
                    aria-pressed={maxSpend > 0 && usedNow === maxSpend}
                    disabled={!preview || maxSpend <= 0}
                    onClick={() => setCashbackToUse(maxSpend)}
                  >
                    {maxSpendPercent != null ? `Maks ${maxSpendPercent}%` : "Maksimal"}
                  </button>
                </div>
                {previewReady && maxSpend <= 0 ? (
                  <p className="pos-field-hint">
                    {Number(customer.balance) > 0 ? "Bu xaridda cashback ishlatib bo‘lmaydi." : "Mijozda cashback balansi yo‘q."}
                  </p>
                ) : !preview && previewState !== "error" ? (
                  <p className="pos-field-hint">Summa kiritilgach limit server tomonidan hisoblanadi.</p>
                ) : null}
              </div>
            ) : (
              <p className="pos-field-hint">Mijoz tanlangach balans va limit ko‘rinadi.</p>
            )}
          </PosStep>
        </ol>

        <aside className="pos-check surface-ops" aria-labelledby="pos-check-title">
          <div className="pos-check-head">
            <h2 id="pos-check-title" className="section-title">{receipt ? "Chek" : "Joriy chek"}</h2>
            {branchName ? <span className="pos-check-branch">{branchName}</span> : null}
          </div>

          {receipt ? (
            <div className={`pos-receipt${receipt.status === "voided" ? " is-voided" : ""}`} role="status">
              <div className="pos-receipt-state">
                {receipt.status === "voided" ? (
                  <><Undo2 size={18} aria-hidden="true" /><span>Chek bekor qilindi</span></>
                ) : (
                  <><CheckCircle2 size={18} aria-hidden="true" /><span>{receiptMessage}</span></>
                )}
              </div>
              <div className="pos-receipt-id">
                <span>{receipt.receiptId}</span>
                <span>{fmtTime(receipt.createdAt)}</span>
              </div>
              <dl className="pos-lines">
                <div><dt>Mijoz</dt><dd>{receipt.customer?.name || "—"}</dd></div>
                <div><dt>Karta</dt><dd>{receipt.customer?.cardNumber || "—"}</dd></div>
                <div><dt>Xarid summasi</dt><dd>{money(receipt.amount)}</dd></div>
                <div><dt>Cashback ishlatildi</dt><dd>−{money(receipt.cashbackUsed)}</dd></div>
              </dl>
              <div className="pos-total">
                <span>To‘landi</span>
                <b>{money(receipt.payable)}</b>
              </div>
              <dl className="pos-lines pos-lines-after">
                <div>
                  <dt>Cashback qo‘shildi{receipt.rateLabel ? ` (${receipt.rateLabel})` : ""}</dt>
                  <dd className="is-earn">+{money(receipt.cashbackEarned)}</dd>
                </div>
                <div><dt>Mijoz balansi</dt><dd>{money(receipt.customer?.balance || 0)}</dd></div>
              </dl>
              <div className="pos-receipt-actions">
                <button type="button" className="btn-primary pos-pay" onClick={resetCustomer}>
                  Yangi sotuv
                </button>
                {receipt.status !== "voided" ? (
                  <button
                    type="button"
                    className="pos-void"
                    disabled={busy === "void"}
                    onClick={() => setVoidTarget(receipt.receiptId)}
                  >
                    <Undo2 size={15} aria-hidden="true" />
                    Chekni bekor qilish
                    <span className="pos-void-note">15 daqiqa ichida</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`pos-check-body${previewState === "loading" ? " is-stale" : ""}`}>
              <dl className="pos-lines">
                <div><dt>Mijoz</dt><dd>{customer ? customer.name : <span className="pos-dim">Tanlanmagan</span>}</dd></div>
                <div><dt>Xarid summasi</dt><dd>{amount ? money(Number(amount)) : <span className="pos-dim">—</span>}</dd></div>
                <div>
                  <dt>Cashback ishlatiladi</dt>
                  <dd>{preview ? `−${money(preview.cashbackUsed)}` : <span className="pos-dim">—</span>}</dd>
                </div>
              </dl>
              <div className="pos-total">
                <span>To‘lanadi</span>
                <b>{preview ? money(preview.payable) : <span className="pos-dim">—</span>}</b>
              </div>
              {preview ? (
                <dl className="pos-lines pos-lines-after">
                  <div>
                    <dt>Cashback qo‘shiladi ({preview.cashbackRateLabel})</dt>
                    <dd className="is-earn">+{money(preview.cashbackEarned)}</dd>
                  </div>
                  <div><dt>Yangi balans</dt><dd>{money(preview.balanceAfter)}</dd></div>
                </dl>
              ) : null}
              {previewError ? <p className="pos-check-note" role="status">{previewError}</p> : null}
              <button
                ref={payRef}
                className="btn-primary pos-pay"
                type="button"
                disabled={!canConfirm}
                onClick={() => void confirmSale()}
              >
                {busy === "sale" ? "Tasdiqlanmoqda…" : "Sotuvni tasdiqlash"}
              </button>
              <p className="pos-pay-hint">{payHint}</p>
            </div>
          )}

          <p className="pos-keys" aria-label="Klaviatura">
            <span><kbd className="pos-kbd">F2</kbd> skaner</span>
            <span><kbd className="pos-kbd">Enter</kbd> summadan tasdiqlashga</span>
          </p>
        </aside>
      </div>

      <section className="pos-history surface-ops" aria-labelledby="pos-history-title">
        <div className="pos-history-head">
          <div>
            <h2 id="pos-history-title" className="section-title">So‘nggi sotuvlar</h2>
            <p className="pos-history-meta">
              {salesState === "ready" ? `${sales.length} ta chek` : "Yuklanmoqda…"}
              {branchName ? ` · ${branchName}` : ""}
            </p>
          </div>
          <button type="button" className="btn-tertiary" onClick={() => void loadSales()} disabled={salesState === "loading"}>
            <RefreshCw size={14} aria-hidden="true" />
            Yangilash
          </button>
        </div>
        {salesState === "error" ? (
          <p className="pos-history-state is-error" role="alert">{salesError}</p>
        ) : (
          <div className="table-wrap pos-history-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Chek</th>
                  <th>Mijoz</th>
                  <th className="num">Summa</th>
                  <th className="num">To‘landi</th>
                  <th className="num">Cashback − / +</th>
                  <th>Holat</th>
                  <th className="actions-cell"><span className="sr-only">Amal</span></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className={sale.status === "voided" ? "is-voided" : undefined}>
                    <td className="pos-cell-time">{fmtTime(sale.createdAt)}</td>
                    <td className="pos-cell-receipt">{sale.receiptId}</td>
                    <td>{sale.customerName}<div className="muted">{sale.cardNumber}</div></td>
                    <td className="num">{money(sale.amount)}</td>
                    <td className="num">{money(sale.payable)}</td>
                    <td className="num pos-cell-cb">
                      <span className="is-use">−{money(sale.cashbackUsed)}</span>
                      <span className="is-earn">+{money(sale.cashbackEarned)}</span>
                    </td>
                    <td>
                      {sale.status === "voided" ? (
                        <StatusBadge tone="neutral">Bekor qilingan</StatusBadge>
                      ) : (
                        <StatusBadge tone="ok">Tasdiqlangan</StatusBadge>
                      )}
                    </td>
                    <td className="actions-cell">
                      {sale.status === "completed" ? (
                        <button
                          type="button"
                          className="btn-tertiary pos-row-void"
                          disabled={busy === "void"}
                          onClick={() => setVoidTarget(sale.receiptId)}
                        >
                          Bekor qilish
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {salesState === "ready" && !sales.length ? (
                  <tr><td colSpan={8} className="pos-history-empty">Bu filialda hali kassa sotuvi yo‘q.</td></tr>
                ) : null}
                {salesState === "loading" && !sales.length ? (
                  <tr><td colSpan={8} className="pos-history-empty">Yuklanmoqda…</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={voidTarget != null}
        title="Chekni bekor qilasizmi?"
        description={
          <>
            Chek <b>{voidTarget}</b> bekor qilinadi, shu chekdagi cashback harakatlari qaytariladi.
            Bekor qilish faqat sotuvdan keyin 15 daqiqa ichida mumkin.
          </>
        }
        confirmLabel="Bekor qilish"
        cancelLabel="Qaytish"
        danger
        busy={busy === "void"}
        onConfirm={() => voidTarget && void voidSale(voidTarget)}
        onCancel={() => setVoidTarget(null)}
      />
    </div>
  );
}
