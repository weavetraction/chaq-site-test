# 차큐(chaQ) 장기렌트 — 프론트엔드 목업 · 백엔드 연동 가이드

정적 HTML/CSS/JS 목업입니다. 별도 빌드 없이 `index.html`을 브라우저로 열면 동작합니다(file:// 더블클릭 가능).
**이 문서는 백엔드 개발자가 실제 기능을 붙이기 위한 연동 지점을 정리한 것입니다. 디자인/마크업은 그대로 두고, 아래 "① 데이터"와 "② 액션(CTA)"만 실서버에 연결하면 됩니다.**

---

## 1. 폴더 구조

```
chaq-doubleclick/
├─ index.html                  # 메인
├─ pages/                      # 서브 페이지 (아래 라우팅 맵 참고)
│  └─ data/                    # ★ 목업 데이터 = API 연동 계약 (동기 전역 주입)
│     ├─ quotes.js   → window.CHAQ         (차량 마스터: stock/fast/estimate)
│     ├─ mypage.js   → window.CHAQ_MYPAGE  (회원 CRM: 주문/저장견적/쿠폰/문의/계좌)
│     ├─ faq.js      → window.CHAQ_FAQ     (FAQ)
│     ├─ reviews.js  → window.CHAQ_REVIEWS (이용후기)
│     ├─ review-link.js → window.CHAQ_REVIEW_LINK (후기 ↔ 차량 연동, 상세 하단 후기 위젯)
│     └─ content.js  → window.CHAQ_CONTENT (아티클/이벤트)
├─ scripts/                    # 공통 스크립트 (redesign.js=메인, detail-overrides.js=서브 공통)
├─ stylesheets/                # redesign.css(메인) · detail-overrides.css(서브 공통)
└─ assets/                     # icons(svg) · img · font(Pretendard)
```

> 데이터 파일은 페이지 `<script src="data/xxx.js">` 로 **동기 로드**되어 전역(`window.CHAQ*`)에 객체를 주입합니다.
> 실연동 시 **로딩 방식(동기 전역)은 유지**하고 그 객체를 **서버 데이터(같은 스키마)로 채우기만** 하면 화면 코드는 수정 불필요합니다.
> (SSR로 전역을 심거나, 파일을 API 응답으로 바꾸는 등 자유. 스키마는 §4 참고.)

---

## 2. 페이지 라우팅 맵

| 페이지 | 파일 | 진입 경로 / 쿼리 |
|---|---|---|
| 메인 | `index.html` | — |
| 재고특가 목록 | `pages/special-price-car__list.html` | 기본 |
| 빠른인도 목록 | `pages/special-price-car__list.html?from=fast` | 같은 페이지, 데이터셋 분기 |
| 견적조회 목록 | `pages/special-price-car__list.html?from=estimate` | 같은 페이지, 데이터셋 분기 |
| 차량 선택(마스터) | `pages/car-select__master.html?type=rate\|instant\|discount` | 즉시출고/금리계산/수입차할인 |
| 차량 상세·셀프견적 | `pages/car-detail.html?id=<차량ID>&term=&plan=&dist=` | §5 조건 파라미터 |
| 아티클 목록/상세 | `pages/posting__list.html` / `pages/posting__detail.html?id=<id>` | 신차장기렌트 |
| 이용후기 | `pages/review__list.html` | — |
| FAQ | `pages/faq__list.html` | — |
| 이벤트 진행/종료 | `pages/event__list__ing.html` / `pages/event__list__end.html` | — |
| 이벤트 상세 | `pages/event__detail.html?id=<id>` | — |
| 마이페이지 | `pages/mypage.html` | 로그인 상태 가정 |
| 개인정보 설정 | `pages/settings.html` | 마이페이지 톱니바퀴(⚙) |
| 로그인/회원가입 | `pages/login.html` | 비로그인 진입점 |
| 약관/개인정보 | `pages/agreement.html` | 운영사이트(chaq.kr) CSS 사용 |

---

## 3. 실연동 시 손대는 곳 = 딱 2가지

1. **데이터** — `pages/data/*.js`의 전역 객체를 서버 데이터로 교체 (§4 스키마).
2. **액션(CTA)** — `data-action` 표시된 목업 버튼을 실제 URL/핸들러로 연결 (§6).

그 외 화면/스타일 코드는 수정 불필요합니다.

---

## 4. 데이터 계약 (window.CHAQ*)

### 4-1. `window.CHAQ` — 차량 마스터 (quotes.js)
```
CHAQ = { stock: [...], fast: [...], estimate: [...] }   // 재고특가 / 빠른인도 / 견적조회
```
차량 레코드 스키마:
```jsonc
{
  "id": "s1",                 // 고유 ID (stock=s*, fast=f*, estimate=e*)
  "brand": "현대", "model": "그랜저",
  "year": "2027년형 가솔린 2.5",  // 연식·유종·배기량 설명자(표시용)
  "trim": "익스클루시브",          // 등급(트림)
  "fuel": "가솔린",               // 전기/하이브리드/가솔린/디젤 (필터 분류용)
  "seg": "준대형",                // 세그먼트(SUV 판별 등)
  "ext": "...", "int": "...",     // 외장/내장 색상
  "fin": "우리금융",              // 금융사/렌탈사
  "opts": [{ "n": "빌트인캠2 PLUS" }],  // 기본 포함 옵션
  "base": 42870000,             // 차량 기본가(원)
  "rem": 13,                    // 재고 수량
  "cost":  { "<dist>": { "<term>": { "<plan>": 월납입금 } } },  // §5
  "resid": { "<dist>": { "<term>": 잔존가치 } },
  // ▼ STEP 8 — Vehicle Master 연결 필드 (tools/quote-trim-*.js 로 생성)
  "trimId": "hyundai-grandeur-gn7-2026-gasoline--exclusive", // window.CHAQ_VEHICLE_MASTER trims[].id, 매칭 실패 시 null
  "vehiclePrice": 42870000,     // 금융사 견적 차량가(= base). 차량가격은 견적에만 존재
  "vmLink": { "status": "MATCHED", "confidence": "HIGH", "yearMatch": false, "quoteModelYear": 2027, "vmModelYear": 2026, "diffs": [ ... ], "reason": "..." }
}
```
- **API 전환 시**: 견적 API 가 `trimId`(고정 레지스트리 `tools/trim-id-registry.json` 의 id)와 `vehiclePrice` 를 직접 내려주면 매칭 스크립트는 필요 없음. 문자열만 내려오면 `node tools/quote-trim-match.js && node tools/quote-trim-apply.js` 로 연결.
- **화면 규칙 (견적 우선)**: 연식·등급 표기·차량가·월납입금·재고 장착옵션·색상은 견적 값, 모델명·이미지(차큐 자체 제작, 세대×외장색)·공식 선택옵션/옵션가·기본품목은 Vehicle Master(연식 차이 1년 이내만, 기준 연식 표기). `CHAQ_VM.quoteView(rec)` 가 합성.
- **상세 진입**: `car-detail.html?id=<견적 id>` (목록 → 실차/견적), `car-detail.html?trimId=<trimId>[&from=stock|fast|estimate]` (차종선택 → 해당 트림 대표 견적 자동 선택: `CHAQ_VM.pickQuote`).

### 4-2. `window.CHAQ_MYPAGE` — 회원 CRM (mypage.js)
```jsonc
{
  "profile":  { "name","grade","phone","joined" },
  "account":  { "bank","number" },                         // 지원금 입금 계좌(설정)
  "orders":   [{ "id"(차량ID), "status"(심사중|심사승인|약정|주문중|출고완료),
                 "date","term","plan","dist",
                 "mgr": { "name","title","photo" } }],       // 담당 매니저(배정)
  "savedQuotes": [{ "id","term","plan","dist","savedAt",
                    "price": 저장당시_월납입금 }],            // ★ price=스냅샷(§5 주의)
  "recentQuotes": ["s1","f10", ...],                        // 최근 본 차량 ID
  "coupons":  [{ "title","amount","expire","used" }],       // (현재 화면 미노출)
  "inquiries":[{ "title","date","status" }]                 // (현재 화면 미노출)
}
```
- **주문 카드**: `orders[].id`로 CHAQ에서 차량 조회 → 차종/월비용 표시, `status`로 단계 스테퍼, `mgr`로 담당 매니저.
- **저장 견적 월비용은 `savedQuotes[].price`(저장 당시 스냅샷)** 를 그대로 표시하고 **실시간 차량데이터와 연동하지 않음**. '확인하기'를 누르면 `id+조건`이 반영된 상세페이지로 이동해 **실시간 월비용**을 보여줌.

### 4-3. `window.CHAQ_FAQ` (faq.js)
```jsonc
{ "cats": ["전체", ...], "items": [{ "c": 카테고리인덱스, "q": 질문, "a": 답변HTML, "p": 미리보기 }] }
```

### 4-4. `window.CHAQ_REVIEWS` (reviews.js)
```jsonc
[{ "id","name","stars","car","trim","text","photos": [url, ...],
   "modelId": "hyundai-palisade",   // Vehicle Master 모델 id — 차량 연동 키(권장)
   "trimId": null }]                // 출고 트림 id (알 때만)
```
- **차량 연동** (`data/review-link.js` → `window.CHAQ_REVIEW_LINK`): 후기 ↔ 차량을 **같은 트림 > 같은 모델 > 같은 계열(familyKey, 예: 캐스퍼 ↔ 캐스퍼 일렉트릭)** 순으로 연결. `modelId`·`trimId` 가 없으면 `car` 문자열("현대 팰리세이드")을 브랜드+모델명으로 정확 일치 매칭.
- **차량 상세 하단 후기 위젯** (`car-detail.html`): 현재 차량(`?trimId=` → `?id=` 견적의 trimId → 견적 브랜드·모델명)에 연결된 후기를 가로 슬라이드 카드로 노출(스와이프·점·4.5초 자동 넘김, 터치/호버 시 정지). 카드 → `review__list.html?id=<후기id>`, 전체보기 → `review__list.html?model=<familyKey>`(차량별 필터). 재고특가(`?id=s…`)·빠른인도(`?id=f…&from=fast`)·견적조회(`?id=e…&from=estimate`)·차종선택(`?trimId=`) 모두 같은 상세 페이지라 전부 적용. 이 차량 후기가 아직 없으면 **전체 최신 후기(최대 10건)** 로 대체하고 제목을 '차큐 고객 이용 후기', 전체보기를 `review__list.html` 로 바꾼다(차량 태그 없음).

### 4-5. `window.CHAQ_CONTENT` (content.js)
```jsonc
{
  "articles": [{ "id","cat","title","date","img","lead","body" }],
  "events":   [{ "id","status"(ing|end),"badge","title","period","img","lead","body","cta" }]
}
```

---

## 5. 계약 조건 · 월비용 계산 규칙 (전 화면 공통)

- **월납입금 = `record.cost[dist][term][plan]`**
- 파라미터 값
  - `dist`(주행거리): `"2"`(2만km) · `"3"`(3만km)
  - `term`(계약기간, 개월): `"36"` · `"48"` · `"60"`
  - `plan`(초기비용): `"0"`(0원) · `"b"`(보증금) · `"s"`(선납금)
- **기본 조건**: 60개월 / 0원 / 2만km → `cost["2"]["60"]["0"]`
- **조건 전달 규칙(리스트→상세)**: 링크에 `&term=&plan=&dist=` 를 실어 보냄
  `detailHref(id, {term,plan,dist}) = car-detail.html?id=<id>&term=<term>&plan=<plan>&dist=<dist>`
  상세페이지는 URL 조건을 칩에 반영 후 재계산.

---

## 6. 목업 액션(CTA) 연동 포인트 — `data-action`

아래 버튼들은 현재 **안내 alert(목업)** 로 처리돼 있습니다. `data-action` 값으로 분류돼 있으니,
실연동 시 **해당 action을 실제 URL 이동 또는 핸들러로 교체**하면 됩니다.
(동작 정의: `scripts/redesign.js`·각 페이지의 `[data-pending-link]` 핸들러, 그리고 `data-action` 참조)

| data-action | 위치 | 연동 대상 |
|---|---|---|
| `inquiry` | 메인/마이페이지 문의 카드, 차량상세 "이 조건 그대로 문의하기", 매니저 채팅 | 상담/문의 채널(카카오상담·전화·상담폼 URL) |
| `login` | 로그인 "카카오로 시작하기" | 카카오 OAuth |
| `signup-phone` | 로그인 "휴대폰 번호로 가입하기" | 휴대폰 본인인증/가입 API |
| `quote-view` | 마이페이지 "견적서 확인하기" | 견적서 조회/다운로드 |
| `account-save` | 설정 "저장하기" | 지원금 입금 계좌 저장 API |
| `withdraw` | 설정 "탈퇴하기" | 회원 탈퇴 API |
| `logout` | 설정 "로그아웃" | 세션 종료 (현재 login.html 이동) |
| `coupon` | 메인 헤더 "채널 추가 쿠폰" 버튼 | 쿠폰함/채널 추가 |

> 실연동 예시: `document.querySelectorAll('[data-action="inquiry"]').forEach(el => el.onclick = () => location.href = 상담URL)`
> 또는 각 페이지 `[data-pending-link]` 핸들러의 `alert(...)`를 라우팅으로 교체.

---

## 7. 백엔드 연동 체크리스트

- [ ] `data/quotes.js` → 차량 마스터 API로 교체 (스키마 §4-1, 월비용 `cost` 3중 맵 유지)
- [ ] `data/mypage.js` → 회원 CRM API로 교체 (주문 상태·담당매니저·저장견적 스냅샷 §4-2)
- [ ] `data/faq.js` / `reviews.js` / `content.js` → 각 CMS/API로 교체
- [ ] `data-action` CTA들을 실제 URL/핸들러로 연결 (§6)
- [ ] 로그인 상태 분기: 비로그인 → `login.html`, 로그인 → `mypage.html`
- [ ] `agreement.html`은 운영사이트(chaq.kr) CSS/JS 사용 — 배포 환경에 맞게 확인

> 조건 파라미터(term/plan/dist)·`detailHref` 규칙(§5)은 리스트↔상세 공통 계약이므로 유지 권장.

## 차량 이미지 (차큐 자체 제작, 2026-09-28~)
- 파일 위치: `assets/vehicles/<이미지키>/<색상키>.png` (`default.png` = 대표). 이미지키·색상키 목록은 `merged/own-images-checklist.xlsx`.
- 파일을 넣은 뒤 `node tools/vm-build-all.js` → 자동 매칭·배포. 상세 페이지는 재고 실차 색상/선택 색상에 맞는 이미지를 보여주고, 없으면 대표 → placeholder.
- 외부 이미지(위키미디어·뉴스룸)와 제원 데이터는 사용하지 않음. 노출 차종은 `scope/scope-models.json`.

## 차량 상세 하단 안내 블록 (후기 위젯 아래, `pages/data/detail-promo.js`)
- 시안(1080px) 수치 그대로, 화면 폭에 비례(container query `--u` = 폭/1080). 레이아웃·기존 섹션 변경 없음.
- 구성: ① 배너(`assets/img/detail-banner-quote.jpg`, 여러 장이면 `BANNERS` 배열에 추가) ② 장기렌트 3타일(`detail-cond-60m/48m.png`, `detail-deal-car.png` + 세일태그 `icons/tag-sale.svg`, `detail-manager-delivery.jpg`) ③ 문의부터 인도까지 5단계(차량 인도 옆 즉시출고 `icons/instant.svg`) ④ 같은 조건, 다른 차량(5단계 바로 아래) ⑤ **자주 묻는 질문 · ChaQ Guide** — 메인(index.html) 섹션 그대로(같은 마크업, `data/faq.js` 카테고리별 대표 1개, 한 번에 하나만 펼침, 더보기 → `faq__list.html`; 스타일은 redesign.css 해당 규칙을 `.dfg` 범위로 옮김).
- ④ 데이터 연동: 현재 선택 조건(계약기간·초기비용·주행거리)으로 같은 목록(재고특가/빠른인도/견적조회)의 **Vehicle Master 연결 견적** 중 월 납입금대(10만원 단위)가 같은 다른 모델을 추천(모델 계열당 1대, 현재 월납입금과 가까운 순, 최대 10). 같은 대가 없으면 '월 납입금이 비슷한 차량'. 조건 칩을 바꾸면 즉시 다시 계산, 운용리스 선택 시 숨김(금액 준비중). 카드 → 같은 조건으로 그 차량 상세.
- 글자 위계(v183): 세 섹션(장기렌트 / 문의부터 인도까지 / 같은 조건)은 페이지 공통 규칙으로 px 고정 — 섹션 제목 22px·700, 항목 제목 16px·700, 소제목·라벨 15px·700, 본문 14px·400, 보조 13px·400, 캡션 11px, 금액 강조 18px·800. 위치·이미지 배치는 시안 비례 유지.

## 차량 데이터 파일 기준 (v186, 2026-09-29~)
- 차량 데이터 = 사용자 제공 파일 `import-xlsx/source.xlsx`(차량목록·트림·색상·옵션) + 모델 이미지 `import-xlsx/images/<브랜드>/<모델명>.png` → `node tools/vm-build-all.js` 가 반영. 파일에 없는 모델(르노 등)은 기존 데이터 유지.
- 트림 가격 `trims.listPrice` = 파일 기준 기본값. 화면은 견적 차량가 우선, 견적이 없으면 트림 기본가. 견적 기준 수정: `node tools/vm-price-from-quotes.js [--write]`, 수동 수정: `import-xlsx/price-overrides.json`.
- 상세: `STEP11_DATA_FILE_IMPORT_REPORT.md`

## 차량 데이터 분할 배포 (v190, 로딩 속도)
- `pages/data/vehicle-master.js` = **공통본**(브랜드·모델·라인업·트림·이미지, 약 1.1MB — 이전 8MB). 모든 페이지가 읽음.
- `pages/data/vm/<모델id>.js` = **모델별 상세본**(옵션·색상·기본품목, 모델당 수십~430KB). 차량 상세에서 그 차량 모델 것만 읽음 → `CHAQ_VM.addDetail` 로 합쳐져 Helper API(`getTrimOptions`·`getTrimColors`·`getStandardItems`·`quoteView` 등)는 그대로.
- 목록·차종 선택의 옵션 개수는 공통본의 `trims.optCount` (`CHAQ_VM.getTrimOptionCount`).
- 빌드 `node tools/vm-build-all.js` 의 [7] 단계가 `tools/vm-split-deploy.js` 로 자동 분할. 전체본은 `merged/vehicle-master.json|js`(검증·도구용).
- 상세페이지: 데이터 반영 전 본문 숨김(로딩 표시), Google 글꼴 비차단 로드, 견본 외부 이미지 제거.

