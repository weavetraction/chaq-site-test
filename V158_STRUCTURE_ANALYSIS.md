# STEP 1 — v158 (chaq_data_v158_refactor1_정비) 구조 분석

분석일 2026-09-23 · 기준 ZIP `chaq_data_v158_refactor1_정비.zip` (64 files, 3.9 MB)

---

## 1. 파일 구성

```
chaq-doubleclick/
├─ index.html                       메인 (quotes.js + faq.js 로 재고특가·빠른인도·FAQ 렌더)
├─ pages/
│  ├─ special-price-car__list.html  재고특가 / ?from=fast 빠른인도 / ?from=estimate 견적조회 (1개 파일, 데이터셋 분기)
│  ├─ car-select__master.html       차량선택 ?type=instant|rate|discount (즉시출고·금리계산·수입차할인)
│  ├─ car-detail.html               상세·셀프견적 ?id=&term=&plan=&dist=&from=
│  ├─ mypage.html / settings.html / login.html / faq / review / event / posting / agreement
│  └─ data/
│     ├─ quotes.js   (638 KB) → window.CHAQ         { stock[187], fast[187], estimate[703] }
│     ├─ mypage.js            → window.CHAQ_MYPAGE
│     ├─ faq.js / reviews.js / content.js
├─ scripts/  redesign.js(메인 UI) · detail-overrides.js(서브 공통 footer/정렬)
├─ stylesheets/  redesign.css · detail-overrides.css
└─ assets/icons/car-placeholder.svg (+ img, logos, font)
```

### file:// 실행 구조
- 빌드 없음. 모든 데이터는 `<script src="data/*.js">` **동기 전역 주입**(`window.CHAQ*`). fetch/XHR 없음 → 더블클릭 실행 가능.
- 외부 의존: Google Fonts(Noto Sans KR), index.html 의 수입차 프로모션 로고 이미지(carisyou CDN). 오프라인이면 폰트/로고만 fallback.
- 페이지 간 이동은 상대경로 + Query Parameter (`?id=s1&term=60&plan=0&dist=2&from=fast`).

---

## 2. 현재 차량 데이터 (window.CHAQ = quotes.js)

### 2-1. 레코드 스키마 (1,077건 공통)
| 필드 | 의미 | 역할 분류 | 비고 |
|---|---|---|---|
| id | `s*`(stock) `f*`(fast) `e*`(estimate) | Quote 키 | 1,077건 중복 없음 |
| gu | 국산/수입/'' | Vehicle | stock·fast 는 전부 `''`, estimate 만 값 있음 |
| brand | 현대·기아·제네시스·KG모빌리티·르노·르노코리아·쉐보레·테슬라 | Vehicle | **르노 / 르노코리아 표기 불일치** |
| model | 그랜저 / 더 뉴 그랜저(GN7) / 디 올 뉴 그랜저 HEV(GN7) … | Vehicle | 금융사 원문 그대로 → **같은 차가 모델명 6종** |
| year | `2027년형 가솔린 2.5`, `GN7 HEV 1.6T 26MY`, `2026가솔린 1.6 터보 9인승` … | Vehicle(Lineup) | 연식·유종·배기량·인승·세대코드가 자유 문자열에 섞임 |
| trim | 익스클루시브 / `가솔린2.5 캘리그래피 2WD` … | Vehicle(Trim) | estimate 는 유종·구동이 trim 문자열에 포함 |
| fuel | 가솔린/전기/하이브리드/LPG/디젤 | Vehicle | estimate 는 전부 `가솔린` (EV3도 가솔린으로 기록 — 데이터 품질 이슈) |
| seg | 준대형/중형 SUV … | Vehicle | estimate 542건 `''` |
| ext / int | 외장/내장 색상명 | Vehicle(Color) | estimate 는 전부 `''`; HEX 없음 (car-detail 이 색상명 정규식으로 임의 HEX 생성) |
| opts | `[{n, p?}]` | Vehicle(Option) | 가격 `p` 있는 레코드 66건뿐 |
| base | 차량 기본가 | **Quote(vehiclePrice)** | 563건 null. → 앞으로 Vehicle Master 필수값 아님 |
| fin | 금융사 | Quote | estimate 703건 전부 `''` |
| rem | 재고수량 | Stock | 372건만 존재 |
| cost[dist][term][plan] | 월납입금 | Quote | dist 2/3 · term 36/48/60 · plan 0/b/s |
| resid[dist][term] | 잔존가치 | Quote | |

### 2-2. 발견 사항
- **stock 과 fast 는 187건이 키(brand·model·year·trim·ext·int·fin) 기준 100% 동일** → 같은 데이터를 두 화면에 복제.
- estimate 는 brand|model|trim 조합이 703건 모두 유일 → 트림 단위 "최저가 1건" 구조.
- 동일 브랜드+모델+트림명이 서로 다른 year 에 존재: 5건 (예 현대|그랜저|익스클루시브 → `2027년형 가솔린 2.5` / `GN7 가솔린 2.5 26MY` / `GN7 HEV 1.6T 26MY`). → Lineup 분리 + 라벨 구분 필요성 실증.
- 차량 이미지 URL 필드 없음(0건). 모든 화면이 `car-placeholder.svg` 고정 사용.
- 차량 식별 키가 문자열(brand/model/trim 이름) 그대로 → 금융사별 표기 차이가 곧 UI 분기 오류로 이어짐. **trimId 도입 필요성의 근거.**

---

## 3. 화면별 데이터 사용 방식

| 화면 | 데이터셋 | 차량 선택 상태 | 이미지 | 가격 |
|---|---|---|---|---|
| index.html | stock(가격그룹별 6건), fast(전체) | 없음 (카드 링크 → car-detail?id) | PH 고정 + onerror 폴백 | cost['2']['60']['0'] |
| special-price-car__list (stock/fast) | `DATA[page]` | `F={brand,model,trim}` 문자열 매칭, 바텀시트 선택 | PH | monthly(cost), 정렬 시 base |
| special-price-car__list?from=estimate | estimate | 동일 F → 최저 월납 1건 est_card | PH | monthly |
| car-select__master?type= | estimate | 동일 F, 선택 완료 시 "견적 준비 중" (외부 API 대기) | PH | 없음 |
| car-detail?id= | stock+fast+estimate 합집합에서 id 검색 | id → rec | PH (HTML 초기값은 carisyou URL 이나 JS 가 즉시 PH 로 교체) | base + opts.p 합, cost/resid |
| mypage | orders/savedQuotes 의 id → rec | id | PH | 스냅샷 price 또는 monthly |

### 차량 선택 상태 관리 (공통)
- 페이지 내 클로저 변수 `F = {brand, model, trim}` (문자열). 페이지 이동 시 **선택 상태는 유지되지 않음** — 상세로는 `id` 만 전달.
- 3단계 UI: `.filter_select[data-filter=brand|model|trim]` → `#filterPop` 바텀시트 → `.fpop_row` 클릭. 등급 선택 시 계약조건 잠금 해제 + 자동 스크롤.
- `optionList()` 가 records 를 brand→model→trim 으로 필터링하며 건수 카운트·국산/수입 그룹(`gu`) 표시.

### placeholder 이미지 구조
- 경로: `assets/icons/car-placeholder.svg` (index 는 `assets/…`, pages 는 `../assets/…`).
- 각 페이지 `var PH = …` 상수. 카드 `<img src=PH>`; index 는 추가로 load/error 이벤트 폴백(`img-loading`/`img-ph` 클래스).
- CSS: `.stock-card > img[src$="car-placeholder.svg"]{transform:none}` (실차 이미지는 scale 1.18) — **실제 이미지 도입 시 이 selector 가 그대로 활용됨**.

---

## 4. 역할 분리 매핑 (현재 필드 → 목표 구조)

| 현재 CHAQ 필드 | Vehicle Master | Quote/Finance/Stock |
|---|---|---|
| brand, gu | brands.nameKo / domesticImport | |
| model | models.nameKo (세대 수식어는 lineups.generationName) | |
| year | lineups.displayName / modelYear / fuelType / engineSummary | |
| trim | trims.name (+ 구동/인승은 trim slug 접미어) | |
| fuel | lineups.fuelType (enum) | |
| seg | models.bodyType (Pilot 자유문자열) | |
| ext, int | colors + trimColors | (선택된 색상은 quote.exteriorColorId/interiorColorId) |
| opts[].n / .p | options + trimOptions.price | (선택 옵션은 quote.selectedOptionIds) |
| **base** | **저장 안 함** | **quote.vehiclePrice** |
| fin, rem, cost, resid | | quote.financeCompany / stock / cost / residual (기존 로직 유지) |
| id (s1/f1/e1) | | quote.quoteId (+ **quote.trimId** 로 연결, STEP 8) |

---

## 5. STEP 1 산출물 (v158 에 추가된 파일)

| 파일 | 내용 |
|---|---|
| `pages/data/vehicle-master.js` | `window.CHAQ_VEHICLE_MASTER` Pilot 빈 컨테이너 + meta/enums |
| `pages/data/vehicle-master-helper.js` | `window.CHAQ_VM` 접근 Helper (조회·라벨·이미지 우선순위·validate) |
| `tools/vm-validate.js` | Node 검증 스크립트 |
| `VEHICLE_DATA_GUIDE_PILOT.md` | Pilot 데이터 가이드 |
| `V158_STRUCTURE_ANALYSIS.md` | 본 문서 |
| index.html · car-select__master · car-detail · special-price-car__list · mypage | `<script>` 태그 2줄 추가만 (렌더링 로직 변경 없음) |

기존 UI·기능·데이터(quotes.js)는 변경하지 않았다. Vehicle Master 가 비어 있어도 모든 화면은 이전과 동일하게 동작한다.

---

## 6. STEP 2 (현대 Pilot) 에서 검증할 구조 리스크 (v158 데이터에서 이미 보이는 것)

1. 같은 차량의 모델명이 금융사마다 다름 (그랜저 / 더 뉴 그랜저(GN7) / 디 올 뉴 그랜저 HEV(GN7)) → models.nameKo 정규화 + lineups.generationName 분리 기준 확정 필요.
2. 동일 트림명이 연식·유종 다른 라인업에 공존 → `trimLabel()` 구분 표기 검증.
3. estimate 의 trim 문자열이 `가솔린2.5 캘리그래피 2WD` 처럼 유종·배기량·구동 포함 → 트림명 분해 규칙.
4. 인승(5/7/9인승)·구동(2WD/AWD) 이 트림인지 라인업인지 — 현대 가격표 기준으로 결정.
5. 색상 HEX 없음 → 제조사 공식 코드만 저장, 화면 색칩 표현 방식(현재는 이름 정규식) 재검토.
6. 옵션 패키지·의존성·배타 규칙이 실제 가격표에서 어떤 형태인지.
7. HEV/EV/FCEV(넥쏘) 제원 필드 적합성, 복수 공차중량.
