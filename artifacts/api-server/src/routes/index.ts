import { Router, type IRouter } from "express";
import healthRouter from "./health";
import loyaltyRouter from "./loyalty";
import catalogRouter from "./catalog";
import branchesRouter from "./branches";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import deliveriesRouter from "./deliveries";
import adminRouter from "./admin";
import integrationsRouter from "./integrations";
import mapsRouter from "./maps";
import authRouter from "./auth";
import posRouter from "./pos";
import workersRouter from "./workers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(posRouter);
router.use(loyaltyRouter);
router.use(catalogRouter);
router.use(branchesRouter);
router.use(cartRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(deliveriesRouter);
router.use(workersRouter);
router.use(adminRouter);
router.use(integrationsRouter);
router.use(mapsRouter);

export default router;
