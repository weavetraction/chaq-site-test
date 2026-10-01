// 처음 한 번: 사이트의 현재 견적 데이터(pages/data/quotes.js)를 DB 로 옮기고 사이트 반영 상태로 만듦
import fs from "node:fs";
import vmmod from "node:vm";
import { pool } from "../db.js";
import { config } from "../config.js";
import { migrate } from "./migrate.js";
import { createBatch, publishBatch } from "../lib/quotes-store.js";
import { KINDS, ParsedRow } from "../lib/quotes-format.js";

(async () => {
  await migrate();
  const has = await pool.query(`SELECT COUNT(*)::int AS n FROM published_sets`);
  if (has.rows[0].n && !process.argv.includes("--force")) { console.log("이미 반영된 데이터가 있습니다 (다시 하려면 --force)"); await pool.end(); return; }
  const ctx: any = { window: {} }; vmmod.createContext(ctx);
  vmmod.runInContext(fs.readFileSync(config.seedQuotesPath, "utf8"), ctx);
  const D = ctx.window.CHAQ; if (!D) throw new Error("quotes.js 에 window.CHAQ 가 없습니다");
  const rows: ParsedRow[] = [];
  for (const k of KINDS) (D[k] || []).forEach((rec: any, i: number) => rows.push({ kind: k, rec: JSON.parse(JSON.stringify(rec)), rowNo: i + 2, errors: [], trimIdGiven: rec.trimId || null }));
  const r = await createBatch(rows, { fileName: "사이트 기존 데이터 (quotes.js)", adminId: null, source: "SEED" });
  await publishBatch(r.batchId, null);
  console.log("seed 완료 batch", r.batchId, JSON.stringify(r.summary.kinds));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
