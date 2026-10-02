// 동작 점검: API_BASE·ADMIN_EMAIL·ADMIN_PASSWORD 로 로그인 → 엑셀 내려받기 → 수정해서 올리기 → 미리보기 → 반영 → 되돌리기 → 문의 접수
//  npm test   (서버가 켜져 있어야 함, 운영 DB 에는 쓰지 마세요 — 마지막에 원래 데이터로 되돌리지만 업로드 이력이 남습니다)
import ExcelJS from "exceljs";
const TEST_TRIM = "테스트 등급 " + Date.now().toString(36);   // 실행마다 새 이름 (이전 실행의 자동 연결 기록에 안 걸리게)

const BASE = process.env.API_BASE || "http://localhost:8080";
let cookie = "";
async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), cookie } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return r;
}
const ok = (cond: unknown, msg: string) => { if (!cond) { console.error("✖", msg); process.exit(1); } console.log("✔", msg); };

(async () => {
  ok((await call("/api/health")).ok, "health");
  const login = await call("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  ok(login.ok, "관리자 로그인");
  const st = await (await call("/api/admin/quotes/status")).json();
  const before = st.published; ok(before.stock && before.estimate, "현재 반영 상태 조회");

  // 1) 재고특가만 내려받아 수정: 첫 행 60개월·2만km·0원 금액 +1000, 1만 km 금액 추가, 새 차량 1행(트림ID 비움)
  const buf = Buffer.from(await (await call("/api/admin/quotes/export.xlsx?kinds=stock")).arrayBuffer());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any); const ws = wb.getWorksheet("견적데이터")!;
  const head: Record<string, number> = {}; ws.getRow(1).eachCell((c, i) => { head[String(c.value)] = i; });
  const r2 = ws.getRow(2); const old = Number(r2.getCell(head["월_2만_60개월_0원"]).value);
  r2.getCell(head["월_2만_60개월_0원"]).value = old + 1000;
  r2.getCell(head["월_1만_60개월_0원"]).value = old - 30000;
  const src = ws.getRow(2).values as any[]; const nr = ws.addRow(src.slice(1));
  nr.getCell(head["견적ID"]).value = ""; nr.getCell(head["차량데이터 트림ID"]).value = ""; nr.getCell(head["등급"]).value = TEST_TRIM;
  const out = Buffer.from(await wb.xlsx.writeBuffer());
  const fd = new FormData(); fd.append("file", new Blob([out]), "smoke.xlsx");
  const up = await call("/api/admin/quotes/upload", { method: "POST", body: fd }); const upj = await up.json();
  ok(up.status === 201, "엑셀 업로드 → 미리보기 " + JSON.stringify(upj.summary?.kinds?.stock));
  ok(upj.summary.kinds.stock.changedPrice >= 1 && upj.summary.kinds.stock.added === 1 && upj.summary.kinds.stock.unlinked >= 1, "미리보기: 금액 변경·신규·미연결 집계");

  // 2) 미연결 행에 트림 지정
  const det = await (await call(`/api/admin/batches/${upj.batchId}?unlinked=1&kind=stock`)).json();
  const target = det.rows.find((r: any) => r.trim === TEST_TRIM); ok(target, "미연결 행 조회");
  const found = await (await call("/api/admin/trims?q=" + encodeURIComponent("그랜저 익스클루시브"))).json(); ok(found.length > 0, "트림 검색 " + found[0]?.label);
  const pt = await call(`/api/admin/batches/${upj.batchId}/rows`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "stock", recId: target.rec_id, trimId: found[0].trimId }) });
  ok(pt.ok, "트림 지정");

  // 3) 반영 → 공개 데이터 확인
  ok((await call(`/api/admin/batches/${upj.batchId}/publish`, { method: "POST" })).ok, "사이트 반영");
  const pub = await (await call("/api/quotes.json")).json();
  const s1 = pub.stock[0];
  ok(s1.cost["2"]["60"]["0"] === old + 1000 && s1.cost["1"]["60"]["0"] === old - 30000, "공개 데이터에 수정 금액·1만 km 반영");
  // 브랜드·모델·등급명은 차량 데이터 기준으로 바뀌고, 엑셀에 적은 이름은 srcName 에 남음
  ok(pub.stock.some((r: any) => r.srcName?.trim === TEST_TRIM && r.trimId === found[0].trimId && r.trim !== TEST_TRIM), "새 차량 + 지정 트림 반영 (이름은 차량 데이터 기준)");
  ok(pub.estimate.length === before.estimate.rows, "다른 구분(견적조회)은 그대로");

  // 4) 되돌리기: 이전 batch 다시 반영
  ok((await call(`/api/admin/batches/${before.stock.batch_id}/publish`, { method: "POST" })).ok, "이전 데이터로 되돌리기");
  const back = await (await call("/api/quotes.json")).json();
  ok(back.stock.length === before.stock.rows && back.stock[0].cost["2"]["60"]["0"] === old, "되돌린 데이터 확인");

  // 5) 문의 접수
  const iq = await call("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "DETAIL", kind: "stock", recId: s1.id, trimId: s1.trimId, carName: "현대 그랜저", trimName: s1.trim, spec: "2027년형 · 가솔린 2.5", conditions: { product: "장기렌트", term: "60", plan: "0", dist: "2" }, monthly: old, options: ["빌트인 캠"], pageUrl: "https://chaq.co.kr/pages/car-detail.html?id=" + s1.id }) });
  const iqj = await iq.json(); ok(iq.status === 201 && iqj.id > 0 && /문의번호/.test(iqj.message), "문의 접수 → 채널톡 메시지 " + JSON.stringify(iqj.message).slice(0, 80));
  const list = await (await call("/api/admin/inquiries")).json(); ok(list.rows.some((r: any) => r.id === iqj.id), "관리자 문의 목록");
  const upd = await call(`/api/admin/inquiries/${iqj.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "IN_PROGRESS", memo: "테스트 메모" }) });
  ok(upd.ok, "문의 상태·메모 변경");
  const bad = await call("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ monthly: "abc" }) });
  ok(bad.status === 400, "잘못된 입력 거부");
  ok((await fetch(BASE + "/api/admin/inquiries")).status === 401, "로그인 없이 관리자 API 거부");
  // 차량 데이터 (서버 시작 후 뒤에서 첫 가져오기 — 최대 60초 대기)
  let core: Response | null = null;
  for (let i = 0; i < 60; i++) { core = await call("/api/pub/vm/core.js"); if (core.ok) break; await new Promise((r) => setTimeout(r, 1000)); }
  ok(core?.ok && (await core.text()).includes("window.CHAQ_VEHICLE_MASTER"), "차량 데이터 공개본 (core.js)");
  const vs = await (await call("/api/admin/vm/status")).json(); ok(vs.counts?.trims > 0 && vs.current, `차량 데이터 작업본·반영본 (트림 ${vs.counts?.trims})`);
  const tr = await (await call("/api/admin/vm/search?q=" + encodeURIComponent("그랜저"))).json(); ok(tr.length > 0, "차량 데이터 검색");
  const mid = (await (await call("/api/admin/vm/trim/" + encodeURIComponent(tr[0].trimId))).json()).model.id;
  ok((await call(`/api/pub/vm/m/${mid}.js`)).ok, "모델별 상세본");
  const dr = await (await call("/api/admin/quotes/stock/draft", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json(); ok(dr.batchId, "견적 화면 수정 작업본");
  // 콘텐츠 (FAQ·후기·이벤트·아티클) — 서버 시작 후 사이트 파일에서 첫 가져오기
  let faqJs = "";
  for (let i = 0; i < 30; i++) { faqJs = await (await call("/api/pub/faq.js")).text(); if (faqJs.includes('"items":[{')) break; await new Promise((r) => setTimeout(r, 1000)); }
  ok(faqJs.includes("window.CHAQ_FAQ"), "자주 묻는 질문 공개본");
  ok((await (await call("/api/pub/reviews.js")).text()).includes("window.CHAQ_REVIEWS"), "이용후기 공개본");
  ok((await (await call("/api/pub/content.js")).text()).includes("window.CHAQ_CONTENT"), "아티클·이벤트 공개본");
  const ctl = await (await call("/api/admin/content/faq")).json(); ok(ctl.items?.length > 0 && ctl.cats?.length > 0, `관리자 FAQ 목록 (${ctl.items?.length})`);
  const cbad = await call("/api/admin/content/faq", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat: ctl.cats[0].id, q: "점검", a: "<p>답<script>x</script></p>" }) });
  const bj = await cbad.json(); ok(cbad.ok && !bj.data.a.includes("script"), "본문 HTML 정리");
  await call(`/api/admin/content/faq/${bj.id}`, { method: "DELETE" });
  console.log("모든 점검 통과");
})().catch((e) => { console.error(e); process.exit(1); });
