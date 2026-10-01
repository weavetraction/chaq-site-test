// 환경 설정 (.env 또는 호스팅 환경변수)
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");                         // server/
const list = (v: string | undefined) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 8080),
  // DATABASE_URL, 또는 AWS(ECS)에서는 RDS 비밀값의 DB_HOST·DB_PORT·DB_USER·DB_PASSWORD·DB_NAME 으로 조합
  databaseUrl: process.env.DATABASE_URL || (process.env.DB_HOST
    ? `postgres://${encodeURIComponent(process.env.DB_USER || "")}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "chaq"}`
    : "postgres://chaq:chaq@localhost:5432/chaq"),
  databaseSsl: process.env.DATABASE_SSL === "true",
  dbPoolMax: Number(process.env.DB_POOL_MAX || 10),
  // 앞단 프록시 수 (CloudFront → ALB = 2) — 접속 IP·요청 제한에 사용
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  jwtSecret: process.env.JWT_SECRET || "",
  // 사이트 주소(CORS 허용) 예: https://chaq.kr,https://weavetraction.github.io
  siteOrigins: list(process.env.SITE_ORIGINS),
  // 차량 데이터(Vehicle Master) 공통본 경로 — 트림 연결·검색에 사용
  vehicleMasterPath: process.env.VEHICLE_MASTER_PATH || path.resolve(ROOT, "../pages/data/vehicle-master.js"),
  // 처음 배포 때 사이트의 현재 견적 데이터(quotes.js)를 DB 로 옮길 때 사용
  seedQuotesPath: process.env.SEED_QUOTES_PATH || path.resolve(ROOT, "../pages/data/quotes.js"),
  publicQuotesMaxAge: Number(process.env.PUBLIC_QUOTES_MAX_AGE || 60),
  isProd: process.env.NODE_ENV === "production",
};

export function assertConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    if (config.isProd) throw new Error("JWT_SECRET 환경변수(32자 이상)가 필요합니다");
    config.jwtSecret = "dev-only-secret-change-me-dev-only-secret";
    console.warn("[config] JWT_SECRET 미설정 — 개발용 값 사용 (운영에서는 반드시 설정)");
  }
}
