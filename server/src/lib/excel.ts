// 견적 데이터 엑셀 양식 만들기·읽기 (exceljs)
import ExcelJS from "exceljs";
import { ALL_HEADERS, BASE_COLUMNS, COST_COLUMNS, RESID_COLUMNS, KINDS, Kind, QuoteRecord, recordToRow, rowToRecord, ParsedRow } from "./quotes-format.js";

export const SHEET = "견적데이터";

export async function buildWorkbook(data: Partial<Record<Kind, QuoteRecord[]>>, opts: { example?: boolean } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = "차큐 관리자";
  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", xSplit: 6, ySplit: 1 }] });
  ws.columns = [
    ...BASE_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: c.width })),
    ...COST_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: 15 })),
    ...RESID_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: 15 })),
  ];
  const head = ws.getRow(1); head.height = 30;
  head.eachCell((cell, i) => {
    const isCost = i > BASE_COLUMNS.length && i <= BASE_COLUMNS.length + COST_COLUMNS.length;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isCost ? "FF1F7A4D" : i > BASE_COLUMNS.length ? "FF4B5563" : "FF111827" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    const note = BASE_COLUMNS[i - 1]?.note; if (note) cell.note = note;
  });
  for (const k of KINDS) for (const r of data[k] || []) ws.addRow(recordToRow(k, r));
  if (opts.example) ws.addRow({ ...recordToRow("stock", { id: "", brand: "현대", model: "그랜저", year: "2027년형 가솔린 2.5", trim: "익스클루시브", ext: "어비스 블랙 펄", int: "블랙 모노톤", fuel: "가솔린", seg: "준대형", fin: "○○캐피탈", opts: [{ n: "빌트인 캠 2 플러스", p: 650000 }, { n: "파노라마 선루프" }], base: 46940000, rem: 3, cost: { "2": { "60": { "0": 648400, "b": 572400, "s": 403200 } } }, resid: { "2": { "60": 29921000 } } }) });
  ws.eachRow((row, n) => { if (n > 1) row.eachCell((c) => { c.font = { name: "Arial", size: 10 }; if (typeof c.value === "number") c.numFmt = "#,##0"; }); });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ALL_HEADERS.length } };
  const guide = wb.addWorksheet("작성안내");
  guide.columns = [{ width: 22 }, { width: 90 }];
  [
    ["구분", "재고특가 / 빠른인도 / 견적조회 — 파일에 들어 있는 구분만 통째로 교체됩니다 (없는 구분은 그대로)"],
    ["견적ID", "기존 행은 그대로 두고, 새 차량은 비워두면 자동 부여 (s·f·e + 번호)"],
    ["월_○만_○개월_○", "월 납입금 (원). 주행거리 1만·2만·3만 km × 36·48·60개월 × 0원·보증금 30%·선납금 30% — 없는 조건은 비워두면 사이트에 '별도문의'"],
    ["잔가_○만_○개월", "인수 시 잔존가치 (원) — 인수 시 총 비용 계산에 사용"],
    ["옵션", "옵션명:가격 | 옵션명:가격 — 가격을 모르면 옵션명만 (사이트에서 공식 옵션가로 보완)"],
    ["차량데이터 트림ID", "비워두면 브랜드·모델·연식·등급이 같은 기존 차량의 트림으로 자동 연결. 안 되는 행은 관리자 화면에서 검색해 지정"],
    ["재고수", "재고특가·빠른인도에서 0 이면 목록에 안 보입니다"],
    ["반영", "업로드 → 미리보기 확인(신규·삭제·금액 변경·미연결) → '사이트 반영' 을 눌러야 실제 사이트에 나갑니다. 이전 업로드를 다시 반영하면 되돌리기"],
  ].forEach((r) => { const row = guide.addRow(r); row.getCell(1).font = { bold: true, name: "Arial" }; row.getCell(2).font = { name: "Arial" }; row.getCell(2).alignment = { wrapText: true }; });
  return wb;
}

export async function parseWorkbook(buf: Buffer): Promise<{ rows: ParsedRow[]; missingHeaders: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.getWorksheet(SHEET) || wb.worksheets[0];
  if (!ws) return { rows: [], missingHeaders: ["(시트 없음)"] };
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => { headers[i] = String(cellValue(c.value) ?? "").trim(); });
  const required = ["구분", "브랜드", "모델", "등급"];
  const missingHeaders = required.filter((h) => !headers.includes(h));
  const rows: ParsedRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (c, i) => { const h = headers[i]; if (h) obj[h] = cellValue(c.value); });
    const p = rowToRecord(obj, n); if (p) rows.push(p);
  });
  return { rows, missingHeaders };
}

/** 엑셀 칸 값 (수식 결과·서식 글자·링크 글자·날짜 → 값) — 차량 데이터 엑셀(vm-excel)도 같이 씀 */
export function cellValue(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object") {
    if ("result" in v) return (v as any).result;          // 수식
    if ("richText" in v) return (v as any).richText.map((t: any) => t.text).join("");
    if ("text" in v) return (v as any).text;               // 하이퍼링크
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return v;
}

