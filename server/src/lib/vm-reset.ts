// 배포 때 한 번만 실행하는 차량 데이터 전체 교체 (seed/vm-reset-<태그>.json.gz = 엑셀 9개 시트를 읽어 둔 행 값)
//  · 관리자 「엑셀로 전체 교체」와 같은 규칙: 기존 ID 는 엑셀 밖 필드 유지 · 교체 직전 작업본 자동 백업(반영 이력) · 적용 후 사이트 반영
//  · 안전장치: 오류가 있거나, 사이트 견적·이용후기 중 하나라도 연결이 끊기면 교체하지 않고 '초기화 보류'로 기록
//  · 결과는 app_state(vm_reset_<태그>) 에 남아 다시 실행되지 않음 — 서버가 여러 대여도 한 대만 (advisory lock)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { q, pool } from "../db.js";
import { ROOT } from "../config.js";
import { log } from "./log.js";
import { publishDraft } from "./vm-store.js";
import { planVmReplace, applyVmReplace, REPLACE_CONFIRM, ReplaceRows } from "./vm-excel.js";

const RESETS = [
  { tag: "261008", file: "vm-reset-261008.json.gz", note: "261008 차량 데이터·이미지 초기화 (마스터 초기화용_261008)" },
];

export async function runPendingVmResets() {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(727004)");
    for (const R of RESETS) {
      const key = `vm_reset_${R.tag}`;
      if ((await q(`SELECT 1 FROM app_state WHERE key = $1`, [key])).rowCount) continue;
      const file = path.join(process.env.SEED_DIR || path.join(ROOT, "seed"), R.file);
      if (!fs.existsSync(file)) { log.warn({ file }, "[vm-reset] 파일 없음 — 건너뜀"); continue; }
      const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")) as ReplaceRows;
      const p = await planVmReplace(rows);
      const blocked = !p.canApply ? `오류 ${p.errorCount}건: ${p.errors.slice(0, 3).join(" / ")}`
        : p.impact.quotes.missing ? `트림이 없어져 끊기는 사이트 견적 ${p.impact.quotes.missing}건: ${p.impact.quotes.missingTrims.slice(0, 5).join(", ")}`
        : p.impact.reviews.missing ? `차종 연결이 끊기는 이용후기 ${p.impact.reviews.missing}건: ${p.impact.reviews.sample.slice(0, 5).join(", ")}`
        : null;
      const set = (v: unknown) => q(`INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(v)]);
      if (blocked) {
        await q(`INSERT INTO vm_changes (action, summary) VALUES ('reset_blocked', $1)`, [`${R.note} — 보류: ${blocked}`.slice(0, 1000)]);
        await set({ status: "blocked", reason: blocked, importId: p.importId, at: new Date().toISOString() });
        log.warn({ tag: R.tag, reason: blocked }, "[vm-reset] 보류 (작업본·사이트 그대로)");
        continue;
      }
      const a = await applyVmReplace(p.importId, REPLACE_CONFIRM, null);
      const pub = await publishDraft(null, R.note);
      await set({ status: "applied", importId: p.importId, backupReleaseId: a.backupReleaseId, releaseId: pub.releaseId, counts: a.counts, hiddenQuotes: p.impact.quotes.hidden, at: new Date().toISOString() });
      log.info({ tag: R.tag, releaseId: pub.releaseId, backup: a.backupReleaseId, counts: a.counts }, "[vm-reset] 전체 교체·사이트 반영 완료");
    }
  } finally { await lock.query("SELECT pg_advisory_unlock(727004)").catch(() => {}); lock.release(); }
}
