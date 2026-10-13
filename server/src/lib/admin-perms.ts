// 관리자 탭별 접근권한 (#46) — owner = 전부 + 계정 관리·외부 연동 키, member = 탭별 none/view/edit
// 판정: GET/HEAD = 보기, 그 외 = 수정. 경로가 표에 없으면 owner 만 (기본 거부)
export const TABS = ["vm", "quotes", "content", "home", "inquiries", "members"] as const;
export type Tab = (typeof TABS)[number];
export type Level = "none" | "view" | "edit";
export type Perms = Partial<Record<Tab, Level>>;
export const TAB_KO: Record<Tab, string> = { vm: "차량 데이터", quotes: "견적 데이터", content: "콘텐츠", home: "메인 화면", inquiries: "상담 문의", members: "회원" };

export function normPerms(x: unknown): Perms {
  const o: Perms = {}; const src = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  for (const t of TABS) { const v = src[t]; o[t] = v === "edit" || v === "view" ? v : "none"; }
  return o;
}

type Rule = { re: RegExp; view: Tab[] | "any" | "owner"; edit: Tab[] | "any" | "owner" };
const RULES: Rule[] = [
  { re: /^\/api\/admin\/(me|logout)(\/|$)/, view: "any", edit: "any" },
  { re: /^\/api\/admin\/(admins|integrations)(\/|$)/, view: "owner", edit: "owner" },
  { re: /^\/api\/admin\/media(\/|$)/, view: ["vm", "content", "home"], edit: ["vm", "content", "home"] },
  // 트림 검색·트림 상세는 콘텐츠(차량 연결)·견적 데이터(트림 연결)에서도 조회
  { re: /^\/api\/admin\/vm\/(search|trim\/[^/]+)$/, view: ["vm", "content", "quotes"], edit: ["vm"] },
  { re: /^\/api\/admin\/vm(\/|$)/, view: ["vm"], edit: ["vm"] },
  { re: /^\/api\/admin\/(quotes|batches|trims)(\/|$)/, view: ["quotes"], edit: ["quotes"] },
  { re: /^\/api\/admin\/content(-cats)?(\/|$)/, view: ["content"], edit: ["content"] },
  { re: /^\/api\/admin\/home(\/|$)/, view: ["home"], edit: ["home"] },
  { re: /^\/api\/admin\/inquiries(\/|$)/, view: ["inquiries"], edit: ["inquiries"] },
  { re: /^\/api\/admin\/members(\/|$)/, view: ["members"], edit: ["members"] },
];

/** 허용이면 null, 아니면 사용자에게 보일 거절 문구 */
export function denyReason(role: string, perms: Perms, method: string, path: string): string | null {
  if (role === "owner") return null;
  const rule = RULES.find((r) => r.re.test(path));
  if (!rule) return "이 기능은 대표 계정만 쓸 수 있어요";
  const write = !(method === "GET" || method === "HEAD");
  const need = write ? rule.edit : rule.view;
  if (need === "any") return null;
  if (need === "owner") return "이 기능은 대표 계정만 쓸 수 있어요";
  const ok = need.some((t) => (write ? perms[t] === "edit" : perms[t] === "view" || perms[t] === "edit"));
  if (ok) return null;
  const tabs = need.map((t) => TAB_KO[t]).join("·");
  return write ? `수정 권한이 없어요 (${tabs}) — 대표에게 권한을 요청하세요` : `접근 권한이 없어요 (${tabs})`;
}

/** 비밀번호 규칙: 10자 이상, 영문·숫자 포함 */
export function pwProblem(pw: string): string | null {
  if (pw.length < 10) return "비밀번호는 10자 이상이어야 해요";
  if (pw.length > 200) return "비밀번호가 너무 길어요";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "비밀번호에 영문과 숫자를 함께 넣어 주세요";
  return null;
}
