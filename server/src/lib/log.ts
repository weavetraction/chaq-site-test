// 구조화 로그 (JSON, CloudWatch 에서 검색) — 개발 중에는 읽기 쉬운 한 줄
import pino from "pino";
export const log = pino({ level: process.env.LOG_LEVEL || "info", base: { app: "chaq-api" }, redact: ["req.headers.cookie", "req.headers.authorization"] });
