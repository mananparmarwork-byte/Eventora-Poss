import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import quotesRouter from "./quotes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(quotesRouter);

export default router;
