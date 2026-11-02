import { Router } from "express";
import { requireAdmin } from "../lib/auth";
import { requirePermission } from "../lib/rbac";
import { loadAdminReport, reportToCsv, resolveReportFilters } from "../lib/adminReports";

const router = Router();

router.get("/admin/reports", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "dashboard:read");
    const filters = resolveReportFilters(user, req.query);
    const report = await loadAdminReport(filters);
    return res.json(report);
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/reports/export", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "dashboard:read");
    const filters = resolveReportFilters(user, req.query);
    const report = await loadAdminReport(filters);
    const csv = reportToCsv(report);
    const from = filters.createdFrom || "all";
    const to = filters.createdTo || "all";
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="vaksinamed-hisobot-${from}-${to}.csv"`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

export default router;
