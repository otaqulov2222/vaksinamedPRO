import { Router, type Request, type Response } from "express";
import { requireCustomer } from "../lib/auth";

const router = Router();

function deliveryDisabled(res: Response) {
  return res.status(400).json({
    message: "Yetkazib berish o‘chirilgan. Manzil saqlash kerak emas.",
    code: "DELIVERY_DISABLED",
  });
}

/**
 * GET — always empty while home delivery is disabled.
 */
router.get(["/customer/addresses", "/api/customer/addresses"], async (req: Request, res: Response) => {
  try {
    await requireCustomer(req);
    return res.json({ addresses: [], count: 0, disabled: true, code: "DELIVERY_DISABLED" });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

router.post(["/customer/addresses", "/api/customer/addresses"], async (req: Request, res: Response) => {
  try {
    await requireCustomer(req);
    return deliveryDisabled(res);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

router.patch(["/customer/addresses/:id", "/api/customer/addresses/:id"], async (req: Request, res: Response) => {
  try {
    await requireCustomer(req);
    return deliveryDisabled(res);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

router.delete(["/customer/addresses/:id", "/api/customer/addresses/:id"], async (req: Request, res: Response) => {
  try {
    await requireCustomer(req);
    return deliveryDisabled(res);
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

export { router as addressesRouter };
