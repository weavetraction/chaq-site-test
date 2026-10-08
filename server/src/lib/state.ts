// app_state(키-값) 공통: 서버가 여러 대일 때 '버전'을 올려 각 서버의 메모리 캐시를 새로 읽게 함
import type pg from "pg";
import { q } from "../db.js";

/** 값 저장 (없으면 추가). 버전 키는 값 생략 = 지금 시각 */
export async function setState(key: string, value: string = String(Date.now()), c?: pg.PoolClient) {
  const sql = `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  if (c) await c.query(sql, [key, value]); else await q(sql, [key, value]);
}
export async function getState(key: string): Promise<string | undefined> {
  const r = await q(`SELECT value FROM app_state WHERE key = $1`, [key]);
  return r.rows[0]?.value as string | undefined;
}
