// 라우터 공통: async 핸들러 오류 전달 · 숫자 경로값 검사 · 엑셀 업로드 설정
import multer from "multer";

export class HttpError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
/** async 핸들러의 오류를 오류 처리기로 넘김 */
export const wrap = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => fn(req, res).catch(next);
/** 경로의 숫자 ID (숫자가 아니면 400 — DB 오류 500 대신) */
export function intParam(v: unknown, label = "ID"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 2_147_483_647) throw new HttpError(`${label} 형식 오류`, 400);
  return n;
}
/** 엑셀 업로드 (메모리, 20MB) */
export const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
