// 차큐 API 서버
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { config, assertConfig, ROOT } from "./config.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { migrate } from "./scripts/migrate.js";
import { pinoHttp } from "pino-http";
import * as Sentry from "@sentry/node";
import { log } from "./lib/log.js";
import { pool } from "./db.js";
import { redis } from "./lib/limits.js";
import { ensureVmReady } from "./lib/vm-store.js";
import { runPendingVmResets } from "./lib/vm-reset.js";
import { ensureContentReady } from "./lib/content.js";

if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.APP_ENV || process.env.NODE_ENV, tracesSampleRate: Number(process.env.SENTRY_TRACES || 0.05) });

assertConfig();
const app = express();
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(pinoHttp({ logger: log, autoLogging: { ignore: (req) => req.url === "/api/health" }, customProps: (req) => ({ ip: (req as any).ip }) }));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

// 공개 API: 사이트 도메인에서 호출 (SITE_ORIGINS). 견적 데이터 스크립트는 어디서든 읽기 허용
const allow = (origin?: string) => !origin || config.siteOrigins.length === 0 || config.siteOrigins.includes(origin) || (!config.isProd && origin === "null");   // null = 내 컴퓨터 파일로 열었을 때 (개발용)
app.use("/api/quotes", cors());
app.use("/api/inquiries", cors({ origin: (o, cb) => cb(null, allow(o)), methods: ["POST", "OPTIONS"] }));
app.use("/api/health", cors());

app.use(publicRouter);
app.use(adminRouter);
// 관리자 화면 (정적 파일)
app.use("/admin", express.static(path.join(ROOT, "admin"), { index: "index.html" }));
app.get("/", (_req, res) => res.redirect("/admin/"));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) { log.error(err); if (process.env.SENTRY_DSN) Sentry.captureException(err); }
  res.status(status).json({ error: status >= 500 ? "서버 오류" : err.message });
});

(async () => {
  if (process.env.AUTO_MIGRATE !== "false") await migrate();
  const server = app.listen(config.port, () => log.info(`[chaq-api] listening on :${config.port}`));
  // 차량 데이터: DB 가 비어 있으면 사이트 파일에서 가져와 첫 반영본 생성 — 뒤에서 진행 (그동안 사이트는 자체 파일, 견적 트림 연결은 사이트 파일 기준)
  ensureVmReady().then(() => runPendingVmResets()).catch((e) => log.error({ err: e }, "[vm] 준비 실패"));   // 배포용 1회 전체 교체 (seed/vm-reset-*)
  ensureContentReady().catch((e) => log.error({ err: e }, "[content] 준비 실패"));   // FAQ·후기·이벤트·아티클 첫 가져오기
  // 배포 교체 시(ECS) 처리 중 요청을 마치고 종료
  const stop = (sig: string) => { log.info({ sig }, "shutting down"); server.close(() => Promise.allSettled([pool.end(), redis?.quit()]).finally(() => process.exit(0))); setTimeout(() => process.exit(0), 15000).unref(); };
  process.on("SIGTERM", () => stop("SIGTERM")); process.on("SIGINT", () => stop("SIGINT"));
})().catch((e) => { console.error(e); process.exit(1); });
