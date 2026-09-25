import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import {
  StatusBadge,
  AdminPageHeader,
  FilterField,
  SearchInput,
  DataTable,
  DetailDrawer,
  DrawerSection,
  FeedbackBanner,
  ErrorState,
  LoadingBlock,
} from "../ui";
import { PAGE_DESCRIPTIONS } from "../nav";

/** Marketing-only contract — not a pricing engine (checkout/POS ignore promos). */
const PROMO_CONTRACT = "PROMO_MARKETING_ONLY";

function errText(err: unknown, fallback: string) {
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401) return "Sessiya tugagan. Qayta kiring.";
  if (status === 403) return "Aksiyalarni ko‘rish uchun ruxsat yo‘q.";
  return err instanceof Error ? err.message : fallback;
}

export function PromosPage(props: { token: string }) {
  const [promos, setPromos] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedKind, setSelectedKind] = useState<"promo" | "reward" | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin/promos", props.token);
      setPromos(Array.isArray(data?.promos) ? data.promos : []);
      setRewards(Array.isArray(data?.rewards) ? data.rewards : []);
    } catch (err) {
      setPromos([]);
      setRewards([]);
      setError(errText(err, "Aksiyalarni yuklab bo‘lmadi."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token]);

  const hasFilters = Boolean(query.trim() || statusFilter);

  const filteredPromos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return promos.filter((item) => {
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (!q) return true;
      return `${item.title} ${item.subtitle} ${item.tag}`.toLowerCase().includes(q);
    });
  }, [promos, query, statusFilter]);

  const filteredRewards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rewards;
    return rewards.filter((item) =>
      `${item.title} ${item.subtitle} ${item.code}`.toLowerCase().includes(q),
    );
  }, [rewards, query]);

  function resetFilters() {
    setQuery("");
    setStatusFilter("");
  }

  function openPromo(item: any) {
    setSelected(item);
    setSelectedKind("promo");
  }

  function openReward(item: any) {
    setSelected(item);
    setSelectedKind("reward");
  }

  function closeDrawer() {
    setSelected(null);
    setSelectedKind(null);
  }

  const emptyBoot = loading && promos.length === 0 && rewards.length === 0;

  return (
    <div className="promos-page page-module">
      <AdminPageHeader
        title="Aksiyalar"
        description={PAGE_DESCRIPTIONS.promos}
        actions={
          <button className="btn-tertiary" type="button" disabled={loading} onClick={() => void load()}>
            Yangilash
          </button>
        }
      />

      <FeedbackBanner tone="warn">
        Marketing kontent — narx katalogda o‘zgarmaydi. Cashback / Loyalty bu yerda emas.
      </FeedbackBanner>

      <div className="crm-controls">
        <div className="crm-controls-primary">
          <FilterField label="Qidiruv" grow>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Nomi yoki teg"
            />
          </FilterField>
          <FilterField label="Holat">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Holat"
            >
              <option value="">Barchasi</option>
              <option value="active">Faol</option>
              <option value="inactive">Nofaol</option>
            </select>
          </FilterField>
          {hasFilters ? (
            <div className="crm-controls-actions">
              <button className="btn-tertiary" type="button" disabled={loading} onClick={resetFilters}>
                Tozalash
              </button>
            </div>
          ) : null}
        </div>
        <p className="meta crm-controls-note">
          Qidiruv yuklangan ro‘yxat bo‘yicha. Yozish / tahrirlash API yo‘q.
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {emptyBoot ? <LoadingBlock rows={3} /> : null}

      {!error && !emptyBoot ? (
        <>
          <div className="crm-context">
            <span className="crm-result-count">{filteredPromos.length} ta aksiya</span>
            {rewards.length > 0 ? (
              <span className="crm-context-hint">{filteredRewards.length} ta sovg‘a kontenti</span>
            ) : null}
            {hasFilters ? <span className="crm-context-hint">Filtrlar qo‘llangan</span> : null}
          </div>

          <div className="crm-surface surface-table">
            <DataTable sticky>
              <thead>
                <tr>
                  <th>Aksiya</th>
                  <th>Holat</th>
                  <th>Teg</th>
                  <th className="promos-col-sub">Tavsif</th>
                </tr>
              </thead>
              <tbody>
                {filteredPromos.length === 0 ? (
                  <tr className="crm-empty-row">
                    <td colSpan={4}>
                      <div className="crm-empty">
                        <div className="empty-title">
                          {promos.length
                            ? "Tanlangan shartlar bo‘yicha aksiya topilmadi."
                            : "Aksiyalar hozircha mavjud emas."}
                        </div>
                        <p className="empty-desc">
                          {promos.length
                            ? "Filtrlarni o‘zgartirib ko‘ring."
                            : "Marketing bannerlari paydo bo‘lganda shu yerda ko‘rinadi."}
                        </p>
                        {hasFilters ? (
                          <button className="btn-tertiary" type="button" onClick={resetFilters}>
                            Filtrlarni tozalash
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPromos.map((item) => {
                    const active = selectedKind === "promo" && selected?.id === item.id;
                    const isOn = Boolean(item.active);
                    return (
                      <tr
                        key={item.id}
                        className={`crm-row${active ? " is-active" : ""}`}
                        tabIndex={0}
                        aria-selected={active}
                        onClick={() => openPromo(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPromo(item);
                          }
                        }}
                      >
                        <td>
                          <div className="crm-name">{item.title || "—"}</div>
                        </td>
                        <td>
                          <StatusBadge tone={isOn ? "ok" : "neutral"}>
                            {isOn ? "Faol" : "Nofaol"}
                          </StatusBadge>
                        </td>
                        <td><span className="meta">{item.tag || "—"}</span></td>
                        <td className="promos-col-sub">
                          <span className="meta">{item.subtitle || "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>

          {rewards.length > 0 ? (
            <>
              <div className="crm-context promos-rewards-context">
                <span className="crm-result-count">Sovg‘alar (katalog kontenti)</span>
                <span className="crm-context-hint">{filteredRewards.length} ta</span>
              </div>
              <div className="crm-surface surface-table">
                <DataTable sticky>
                  <thead>
                    <tr>
                      <th>Nomi</th>
                      <th>Kod</th>
                      <th className="num">Ball</th>
                      <th className="promos-col-sub">Tavsif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRewards.length === 0 ? (
                      <tr className="crm-empty-row">
                        <td colSpan={4}>
                          <div className="crm-empty">
                            <div className="empty-title">Tanlangan shartlar bo‘yicha sovg‘a topilmadi.</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRewards.map((item) => {
                        const active = selectedKind === "reward" && selected?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            className={`crm-row${active ? " is-active" : ""}`}
                            tabIndex={0}
                            aria-selected={active}
                            onClick={() => openReward(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openReward(item);
                              }
                            }}
                          >
                            <td>
                              <div className="crm-name">{item.title || "—"}</div>
                            </td>
                            <td><span className="meta">{item.code || "—"}</span></td>
                            <td className="num">{item.points != null ? item.points : "—"}</td>
                            <td className="promos-col-sub">
                              <span className="meta">{item.subtitle || "—"}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </DataTable>
              </div>
            </>
          ) : null}

          <details className="promos-tech">
            <summary>Texnik holat</summary>
            <p className="meta">
              <code>{PROMO_CONTRACT}</code> — marketing banner / katalog kontenti.
              Checkout va POS promo chegirma qo‘llamaydi; narx katalogda.
            </p>
          </details>
        </>
      ) : null}

      <DetailDrawer
        open={Boolean(selected)}
        width="md"
        title={
          selectedKind === "reward"
            ? (selected?.title || "Sovg‘a")
            : (selected?.title || "Aksiya")
        }
        subtitle={
          selectedKind === "promo"
            ? (selected?.tag || undefined)
            : (selected?.code || undefined)
        }
        status={
          selectedKind === "promo" && selected ? (
            <StatusBadge tone={selected.active ? "ok" : "neutral"}>
              {selected.active ? "Faol" : "Nofaol"}
            </StatusBadge>
          ) : undefined
        }
        onClose={closeDrawer}
      >
        {selectedKind === "promo" && selected ? (
          <>
            <DrawerSection title="Asosiy ma’lumot">
              <dl className="crm-kv">
                <div>
                  <dt>Nomi</dt>
                  <dd>{selected.title || "—"}</dd>
                </div>
                <div>
                  <dt>Teg</dt>
                  <dd>{selected.tag || "—"}</dd>
                </div>
                <div>
                  <dt>Tavsif</dt>
                  <dd>{selected.subtitle || "—"}</dd>
                </div>
                <div>
                  <dt>Holat</dt>
                  <dd>{selected.active ? "Faol" : "Nofaol"}</dd>
                </div>
              </dl>
            </DrawerSection>
            <DrawerSection title="Chegirma / muddat">
              <p className="meta">
                Chegirma foizi, muddat va filial qamrovi bu yozuvda yo‘q.
                Bu marketing banner — narx / chegirma engine emas.
              </p>
            </DrawerSection>
            <DrawerSection title="Cashback">
              <p className="meta">
                Cashback / Loyalty alohida modulda. Aksiya balansi yoki cashback foizi emas.
              </p>
            </DrawerSection>
          </>
        ) : null}

        {selectedKind === "reward" && selected ? (
          <DrawerSection title="Sovg‘a kontenti">
            <dl className="crm-kv">
              <div>
                <dt>Nomi</dt>
                <dd>{selected.title || "—"}</dd>
              </div>
              <div>
                <dt>Kod</dt>
                <dd>{selected.code || "—"}</dd>
              </div>
              <div>
                <dt>Ball</dt>
                <dd>{selected.points != null ? selected.points : "—"}</dd>
              </div>
              <div>
                <dt>Tavsif</dt>
                <dd>{selected.subtitle || "—"}</dd>
              </div>
            </dl>
            <p className="meta">
              Katalog kontenti. Buyurtma narxiga avtomatik chegirma sifatida qo‘llanmaydi.
            </p>
          </DrawerSection>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
