/**
 * FOM external filial id (SITE `O` / report `pFilial_id` / CASHBACK `branch`)
 * → app `branches.id`.
 *
 * Env (optional until vendor sends real mapping):
 *   FOM_BRANCH_MAP={"1":2,"2":3}
 *   FOM_DEFAULT_BRANCH_ID=2
 *
 * Never invents branches. Missing map → null (caller decides soft fail).
 */

export function parseFomBranchMap(raw?: string | null): Record<string, number> {
  const text = String(raw ?? process.env.FOM_BRANCH_MAP ?? "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const id = Number(v);
      if (String(k).trim() && Number.isFinite(id) && id > 0) {
        out[String(k).trim()] = Math.floor(id);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveAppBranchId(
  fomBranchExternalId: string | number | null | undefined,
  opts?: { mapJson?: string; defaultBranchId?: number | null },
): { branchId: number | null; via: "map" | "default" | "none"; fomKey: string } {
  const fomKey = String(fomBranchExternalId ?? "").trim();
  const map = parseFomBranchMap(opts?.mapJson);
  if (fomKey && map[fomKey] != null) {
    return { branchId: map[fomKey], via: "map", fomKey };
  }

  const fromEnv = Number(process.env.FOM_DEFAULT_BRANCH_ID || 0);
  const fallback =
    opts?.defaultBranchId != null && Number.isFinite(Number(opts.defaultBranchId))
      ? Math.floor(Number(opts.defaultBranchId))
      : Number.isFinite(fromEnv) && fromEnv > 0
        ? Math.floor(fromEnv)
        : null;

  if (fallback != null && fallback > 0) {
    return { branchId: fallback, via: "default", fomKey };
  }

  return { branchId: null, via: "none", fomKey };
}
