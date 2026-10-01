// 요청 횟수 제한 — 서버가 여러 대(ECS 2대 이상)면 REDIS_URL 로 공유 (없으면 서버별 메모리)
import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import { log } from "./log.js";

const url = process.env.REDIS_URL;
export const redis = url ? createClient({ url, socket: { reconnectStrategy: (n) => Math.min(n * 200, 5000) } }) : null;
if (redis) {
  redis.on("error", (e) => log.warn({ err: e.message }, "[redis] error"));
  redis.connect().then(() => log.info("[redis] connected")).catch((e) => log.warn({ err: e.message }, "[redis] connect failed"));
}

// 연결이 끊겨 있으면 기다리지 않고 바로 실패 → passOnStoreError 로 통과 (요청이 멈추지 않게)
const send = (...args: string[]) => (redis && redis.isReady ? redis.sendCommand(args) : Promise.reject(new Error("redis not ready"))) as Promise<any>;
function redisStore(prefix: string) {
  const st: any = new RedisStore({ prefix: "rl:" + prefix + ":", sendCommand: send });
  st.incrementScriptSha?.catch?.(() => {}); st.getScriptSha?.catch?.(() => {});   // 시작 때 Redis 가 아직이면 다음 요청에서 다시 불러옴
  return st as RedisStore;
}

export function limiter(prefix: string, opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: true, legacyHeaders: false,
    passOnStoreError: true,                                   // Redis 장애 시 제한 없이 통과 (서비스는 계속)
    ...(redis ? { store: redisStore(prefix) } : {}),
    ...opts,
  });
}
