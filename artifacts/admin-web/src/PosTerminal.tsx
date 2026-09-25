import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  token: string;
  branches: any[];
  defaultBranchId?: number | null;
  request: (path: string, token: string | null, init?: RequestInit) => Promise<any>;
  money: (n: number) => string;
};

/**
 * POS cashback UX — server remains authoritative.
 * Slider max MUST come from preview.maxSpend (engine clamp), never min(balance, amount).
 */
export function PosTerminal({ token, branches, defaultBranchId, request, money }: Props) {
  const scanRef = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState("");
  const [branchId, setBranchId] = useState<number>(defaultBranchId || branches[0]?.id || 0);
  const [customer, setCustomer] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [cashbackToUse, setCashbackToUse] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function loadSales() {
    const data = await request(`/api/pos/sales?branchId=${branchId || ""}&limit=25`, token);
    setSales(data.sales || []);
  }

  useEffect(() => {
    scanRef.current?.focus();
    void loadSales().catch(() => undefined);
  }, [branchId]);

  useEffect(() => {
    if (!customer || !amount) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      void request("/api/pos/preview", token, {
        method: "POST",
        body: JSON.stringify({ qr, amount: Number(amount), cashbackToUse }),
      })
        .then((data) => {
          const next = data.preview;
          setPreview(next);
          // Clamp requested USE to server maxSpend (never imply > policy).
          const serverMax = Math.max(0, Math.floor(Number(next?.maxSpend) || 0));
          if (cashbackToUse > serverMax) {
            setCashbackToUse(serverMax);
          }
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Hisob xatosi"));
    }, 250);
    return () => clearTimeout(t);
  }, [customer, amount, cashbackToUse, qr, token]);

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    setReceipt(null);
    try {
      const data = await request("/api/pos/lookup", token, {
        method: "POST",
        body: JSON.stringify({ qr }),
      });
      setCustomer(data.customer);
      setCashbackToUse(0);
      setOkMsg(`Mijoz topildi · ${data.scanSource === "signed_qr" ? "dinamik QR" : "karta kodi"}`);
    } catch (err) {
      setCustomer(null);
      setPreview(null);
      setError(err instanceof Error ? err.message : "Skan xatosi");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSale() {
    if (!customer || !preview) return;
    setBusy(true);
    setError("");
    try {
      const data = await request("/api/pos/sale", token, {
        method: "POST",
        body: JSON.stringify({
          qr,
          amount: Number(amount),
          cashbackToUse,
          branchId,
        }),
      });
      setReceipt(data.receipt);
      setCustomer(data.customer);
      setOkMsg(data.message || "Sotuv tasdiqlandi");
      setAmount("");
      setCashbackToUse(0);
      setPreview(null);
      setQr("");
      await loadSales();
      scanRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sotuv xatosi");
    } finally {
      setBusy(false);
    }
  }

  async function voidSale(receiptId: string) {
    if (!confirm(`Chek ${receiptId} bekor qilinsinmi?`)) return;
    setBusy(true);
    try {
      await request("/api/pos/void", token, {
        method: "POST",
        body: JSON.stringify({ receiptId }),
      });
      setOkMsg("Chek bekor qilindi");
      setReceipt(null);
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bekor qilish xatosi");
    } finally {
      setBusy(false);
    }
  }

  function resetCustomer() {
    setCustomer(null);
    setPreview(null);
    setReceipt(null);
    setAmount("");
    setCashbackToUse(0);
    setQr("");
    setOkMsg("");
    setError("");
    scanRef.current?.focus();
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

  return (
    <div className="pos-shell stack-gap">
      <div className="pos-top">
        <div>
          <h1 className="page-title">Kassa POS</h1>
          <p className="page-desc">Kassir ish oqimi. Cashback USE limiti faqat server preview.maxSpend (odatda 30%) — UI foizni ixtiyoriy tanlamaydi.</p>
        </div>
        <select
          className="pos-branch"
          value={branchId}
          onChange={(e) => setBranchId(Number(e.target.value))}
          aria-label="Filial"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="pos-steps" aria-label="POS bosqichlari">
        <span className={`pos-step${customer ? " done" : " active"}`}>1. Mijoz</span>
        <span className={`pos-step${customer && amount ? " done" : customer ? " active" : ""}`}>2. Xarid</span>
        <span className={`pos-step${customer && amount && preview ? " done" : customer && amount ? " active" : ""}`}>3. Cashback</span>
        <span className={`pos-step${receipt ? " done" : preview ? " active" : ""}`}>4. To‘lov</span>
        <span className={`pos-step${receipt ? " active done" : ""}`}>5. Chek</span>
      </div>

      {(error || okMsg) && (
        <div className={`pos-banner ${error ? "pos-banner-err" : "pos-banner-ok"}`}>
          {error || okMsg}
        </div>
      )}

      <div className="pos-grid">
        <section className="card pos-panel">
          <h2>1. Mijoz QR</h2>
          <form onSubmit={lookup} className="pos-scan">
            <input
              ref={scanRef}
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              placeholder="Skaner shu yerga yozadi… yoki kodni qo‘lda kiriting"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="primary" type="submit" disabled={busy || !qr.trim()}>
              Topish
            </button>
          </form>
          <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            USB skaner Enter bilan yuboradi. Dinamik QR (VM1…) yoki karta: VAKSINA-ID / VM-00001234.
          </p>

          {customer ? (
            <div className="pos-customer">
              <div className="pos-customer-head">
                <div>
                  <div className="pos-name">{customer.name}</div>
                  <div className="muted">{customer.phoneMasked} · {customer.cardNumber}</div>
                </div>
                <button type="button" className="ghost" onClick={resetCustomer}>Yangi mijoz</button>
              </div>
              <div className="pos-stats">
                <div><span className="muted">Balans</span><b>{money(customer.balance)}</b></div>
                <div><span className="muted">Daraja</span><b>{customer.tier}</b></div>
                <div><span className="muted">Cashback</span><b>{customer.cashbackRateLabel}</b></div>
                <div><span className="muted">Xaridlar</span><b>{customer.purchasesCount}</b></div>
              </div>
            </div>
          ) : (
            <div className="pos-empty">Mijoz QR kodini skanerlang</div>
          )}
        </section>

        <section className="card pos-panel">
          <h2>2. Xarid</h2>
          <label className="muted">Summa (so‘m)</label>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="250000"
            disabled={!customer}
            className="pos-amount"
          />
          <div className="pos-keypad">
            {[10000, 25000, 50000, 100000, 250000, 500000].map((n) => (
              <button
                key={n}
                type="button"
                className="ghost"
                disabled={!customer}
                onClick={() => setAmount(String(n))}
              >
                {money(n)}
              </button>
            ))}
          </div>

          <div className="pos-spend">
            <div className="pos-spend-head">
              <span>
                Cashback ishlatish
                {maxSpendPercent != null ? (
                  <span className="muted"> · {spendLabel}</span>
                ) : null}
              </span>
              <b>{money(Math.min(cashbackToUse, maxSpend))}</b>
            </div>
            <input
              type="range"
              min={0}
              max={maxSpend || 0}
              step={1000}
              value={Math.min(cashbackToUse, maxSpend)}
              disabled={!customer || !preview || maxSpend <= 0}
              onChange={(e) => setCashbackToUse(Number(e.target.value))}
            />
            <div className="pos-spend-actions">
              <button type="button" className="ghost" disabled={!customer} onClick={() => setCashbackToUse(0)}>0</button>
              <button
                type="button"
                className="ghost"
                disabled={!customer || !preview || maxSpend <= 0}
                onClick={() => setCashbackToUse(maxSpend)}
              >
                {spendLabel}
              </button>
            </div>
            {preview && maxSpendPercent != null ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Ruxsat etilgan maksimum: {money(maxSpend)} ({spendLabel}). Yakuniy hisob serverda.
              </p>
            ) : null}
          </div>

          {preview ? (
            <div className="pos-preview">
              <div><span>Xarid</span><b>{money(preview.amount)}</b></div>
              <div><span>Cashback −</span><b className="warn">−{money(preview.cashbackUsed)}</b></div>
              <div><span>To‘lov</span><b>{money(preview.payable)}</b></div>
              <div><span>Cashback + ({preview.cashbackRateLabel})</span><b className="ok">+{money(preview.cashbackEarned)}</b></div>
              <div className="pos-preview-total"><span>Yangi balans</span><b>{money(preview.balanceAfter)}</b></div>
            </div>
          ) : null}

          <button
            className="primary pos-confirm"
            type="button"
            disabled={busy || !customer || !preview}
            onClick={() => void confirmSale()}
          >
            {busy ? "Kutilmoqda…" : "Sotuvni tasdiqlash"}
          </button>
        </section>

        <section className="card pos-panel pos-receipt-panel">
          <h2>3. Chek</h2>
          {receipt ? (
            <div className="pos-receipt">
              <div className="pos-receipt-brand">VAKSINA MED</div>
              <div className="muted">{receipt.branch?.name}</div>
              <div className="pos-receipt-id">{receipt.receiptId}</div>
              <hr />
              <div><span>Mijoz</span><b>{receipt.customer?.name}</b></div>
              <div><span>Karta</span><b>{receipt.customer?.cardNumber}</b></div>
              <div><span>Summa</span><b>{money(receipt.amount)}</b></div>
              <div><span>Ishlatildi</span><b>−{money(receipt.cashbackUsed)}</b></div>
              <div><span>To‘landi</span><b>{money(receipt.payable)}</b></div>
              <div><span>Cashback</span><b className="ok">+{money(receipt.cashbackEarned)}</b></div>
              <div><span>Balans</span><b>{money(receipt.customer?.balance || 0)}</b></div>
              <hr />
              <button type="button" className="ghost" onClick={() => void voidSale(receipt.receiptId)}>
                Bekor qilish (15 daq.)
              </button>
            </div>
          ) : (
            <div className="pos-empty">Tasdiqlangan chek shu yerda chiqadi</div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>So‘nggi kassa sotuvlari</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Chek</th>
              <th>Mijoz</th>
              <th>Summa</th>
              <th>− / +</th>
              <th>Holat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.receiptId}<div className="muted">{sale.branchName}</div></td>
                <td>{sale.customerName}<div className="muted">{sale.cardNumber}</div></td>
                <td>{money(sale.amount)}</td>
                <td>
                  <span className="warn">−{money(sale.cashbackUsed)}</span>
                  {" / "}
                  <span className="ok">+{money(sale.cashbackEarned)}</span>
                </td>
                <td>{sale.status === "voided" ? <span className="warn">void</span> : <span className="ok">ok</span>}</td>
                <td>
                  {sale.status === "completed" ? (
                    <button type="button" className="ghost" onClick={() => void voidSale(sale.receiptId)}>Bekor</button>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {!sales.length ? (
              <tr><td colSpan={6} className="muted">Hali sotuv yo‘q</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
