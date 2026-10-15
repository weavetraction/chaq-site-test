import pg from "pg";
import { config } from "./config.js";

pg.types.setTypeParser(1082, (v: string) => v);   // DATE(출고일 등)는 'YYYY-MM-DD' 그대로 (시간대 밀림 방지)
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: config.dbPoolMax,
});

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

/** 트랜잭션: 콜백 안에서 client.query 사용 */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  let broken: Error | undefined;
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch (re) { broken = re as Error; }   // 롤백도 실패한 연결은 버림
    throw e;
  } finally {
    c.release(broken);
  }
}
