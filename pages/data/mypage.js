/* 차큐 마이페이지 목업 데이터 (회원 활동 + CRM/차량 연동)
   - 실제로는 회원 CRM + 차량 마스터(quotes.js) API와 연동
   - 차량 상세는 id로 quotes.js(stock/fast/estimate)에서 조회
   ★ 실연동: 회원 CRM API로 교체. 상세 → ../../README.md §4-2 */
window.CHAQ_MYPAGE = {
  profile: {
    name: "강병진",
    grade: "차큐 VIP",
    phone: "010-****-5299",
    joined: "2026.03 가입"
  },

  /* 지원금 입금 계좌 (개인정보 설정 > 계좌 관리) — 저장된 계좌 표시용 목업 */
  account: { bank: "카카오뱅크", number: "33330134567" },

  /* 진행 현황 — 주문/심사 단계(CRM) + 차량(id) + 담당 매니저(CRM) 연동
     status: 심사중 → 심사승인 → 약정 → 주문중 → 출고완료
     mgr: 담당 매니저(사진/이름/직책) — 실제로는 CRM 배정 매니저 연동, photo는 실제 사진으로 교체 */
  orders: [
    { id: "s1",  status: "주문중",   date: "2026.09.18", term: "60", plan: "0", dist: "2",
      mgr: { name: "김도현", title: "담당 매니저", photo: "../assets/icons/manager-avatar.svg" } },
    { id: "f10", status: "약정",     date: "2026.09.15", term: "48", plan: "0", dist: "2",
      mgr: { name: "이서연", title: "담당 매니저", photo: "../assets/icons/manager-avatar.svg" } },
    { id: "s30", status: "심사승인", date: "2026.09.20", term: "60", plan: "b", dist: "3",
      mgr: { name: "박지훈", title: "담당 매니저", photo: "../assets/icons/manager-avatar.svg" } },
    { id: "f55", status: "심사중",   date: "2026.09.21", term: "36", plan: "0", dist: "2",
      mgr: { name: "최유나", title: "담당 매니저",       photo: "../assets/icons/manager-avatar.svg" } }
  ],

  /* 내가 저장한 견적 — 차량(id) + 저장 시점 조건 + '저장 당시' 월비용 스냅샷(price)
     price: '견적 저장하기' 누른 시점의 월비용을 그대로 보관(실시간 차량데이터와 연동하지 않음).
     '확인하기'를 누르면 저장된 차량/조건이 반영된 상세페이지로 이동해 실시간 월비용을 보여줌. */
  savedQuotes: [
    { id: "s5",  term: "60", plan: "0", dist: "2", savedAt: "2026.09.10", price: 459600 },
    { id: "s45", term: "48", plan: "b", dist: "2", savedAt: "2026.09.12", price: 590810 },
    { id: "f80", term: "60", plan: "0", dist: "3", savedAt: "2026.09.14", price: 656150 }
  ],

  /* 최근 본 견적 — 최근 조회한 차량 id (최신순) */
  recentQuotes: ["s1", "s12", "f10", "s60", "f120", "s30", "f8"],

  /* 내 쿠폰 */
  coupons: [
    { title: "신규가입 축하 쿠폰",  amount: "50,000",  expire: "2026.12.31", used: false },
    { title: "출고 이벤트 쿠폰",     amount: "100,000", expire: "2026.10.31", used: false },
    { title: "후기 작성 감사 쿠폰",  amount: "30,000",  expire: "2026.09.30", used: true }
  ],

  /* 내 문의 */
  inquiries: [
    { title: "현대 그랜저 견적 관련 문의드립니다", date: "2026.09.19", status: "답변완료" },
    { title: "만기 시 인수 절차가 궁금합니다",      date: "2026.09.16", status: "답변대기" }
  ]
};
