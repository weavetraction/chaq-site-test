# STEP 5 — 국산 전체 Vehicle Master 구축 보고 (기아 → 제네시스 → KGM → 르노코리아 → 쉐보레 → GMC)

기준일 2026-09-24 · 스키마 final-1.0 (FINAL LOCK 유지, 변경 없음) · 차량 판매가격 미기록(validate 금지 필드 검사 통과)

## 1. 결과 요약

| 브랜드 | 모델 | 라인업 (채널) | 트림 | 옵션 / 트림옵션행 (가격 null) | 색상 / 조합규칙 | 제원 | validate | 상태 |
|---|---|---|---|---|---|---|---|---|
| 현대 (STEP 4) | 30 | 56 | 185 | 425 / 1,001 (0) | 120 / 25 | 461 | 0 오류 | 이미지 VERIFIED 39 |
| **기아** | **27** | **69** (일반 56 · 렌터카 2 · 장애인 2 · 상용 8 · 영업용 1) | **221** | **323 / 1,260 (30)** | 111 / 146 | 326 | 0 오류 | 완료 · 이미지 VERIFIED 64 / REVIEW 2 / NOT_FOUND 3 |
| **KG모빌리티** | **12** | **16** (일반 14 · 상용 2) | **37** | **137 / 229 (3)** | 49 / 4 | 90 | 0 오류 | 완료 (가격표 일부 구본) · 이미지 VERIFIED 14 / REVIEW 2 |
| **르노코리아** | **3** | **7** | **21** | **21 / 53 (0)** | 22 / 2 | 18 | 0 오류 | 완료 (가격표 2026.02/05 판) · 이미지 VERIFIED 7 |
| **쉐보레** | **2** | **2** | **6** | **13 / 17 (0)** | 15 / 0 | 12 | 0 오류 | 완료 · 이미지 VERIFIED 2 |
| **GMC** | **4** | **4** | **5** | **0 / 0** | 20 / 3 | 5 | 0 오류 | 완료 (옵션가 미공개) · 이미지 VERIFIED 4 |
| **제네시스** | **17** | **31** | **39** | **178 / 378 (378 — 전부 null)** | 59 / 5 | 68 | 0 오류 | 완료(공식 웹서비스 API 기반) · **옵션가·색상 추가금 미확보(§5)** · 이미지 후보 33 LICENSE_NOT_VERIFIED |
| **통합 (7 브랜드)** | **95** | **185** | **514** | **1,097 / 2,938** | 396 / 185 | 980 | **0 오류** | 이미지 VERIFIED 130 / REVIEW 21 / NOT_FOUND 3 / LICENSE_NOT_VERIFIED 30(제네시스) · `pages/data/vehicle-master.js` 5.1 MB |

- 데이터 출처: 각 제조사 공식 사이트의 가격표 PDF · 가격 페이지(HTML) · 제원 페이지 · 카탈로그 PDF만 사용. 네이버자동차/카이즈유/다나와/블로그/위키 미사용. 브랜드별 `SOURCE_CATALOG.md` 에 URL·기준일 전부 기록.
- 화면 회귀(Playwright, file://): 신규 브랜드 트림 **290건 전부** `car-detail.html?trimId=` 렌더 OK(콘솔 오류 0, `차량가 문의` 표시). `car-select__master.html` 브랜드 팝업 [국산] 현대 151 · 기아 174 · KG모빌리티 33 · 르노코리아 21 · 쉐보레 6 · GMC 5 (GENERAL+RENTAL 채널만 노출), 모델 팝업·등급 팝업(라인업 섹션 헤더) 정상. 레이아웃 변경 없음.

## 2. 파이프라인 (브랜드 범용화)

| 파일 | 역할 |
|---|---|
| `<brand>/SOURCE_CATALOG.json/.md` | 공식 소스 URL 목록 (서브에이전트가 kia.com 등에서 직접 확인) |
| `<brand>/raw2/<slug>.json` | 원시 추출 (RAW_EXTRACTION_SPEC_V2 골격 + `kia/RAW_EXTRACTION_SPEC.md` 규칙). 판매가격 미기록, 원문 verbatim, 문서당 WebFetch 5회 이상 분할 |
| `<brand>/brand-config.json` | 모델 id/familyKey/세대명/이미지 그룹, `mergeInto`(K8 택시 → K8), `powertrainSplit`(카니발 하이브리드) |
| `tools/vm-build-brand.js` | 범용 빌더: raw2 → 브랜드 FINAL json/js (라인업·트림·옵션·색상·colorRules·제원 매핑, 이미지 후보 연결) |
| `tools/vm-merge.js` | 브랜드 파일 병합 → `merged/vehicle-master.js` (id 충돌 검사) → `pages/data/vehicle-master.js` |
| `chaq-doubleclick/tools/vm-validate.js` | FINAL 검증 (가격 필드 금지, enum, 참조 무결성) |
| `commons-search-step5.html` | Commons Action API 카테고리 스윕 도구 (45 그룹) — 사용자 PC 실행용 |

## 3. 브랜드별 구조 결정 (원칙: Model = 제조사 판매 단위, Lineup = 내부 구분)

- **기아**: kia.com 이 하이브리드를 같은 모델 페이지의 탭으로 팔므로 `쏘렌토` 1 모델 안에 `가솔린 2.5 터보 / 하이브리드 1.6 터보 / 블랙 에디션…` 라인업. GT(EV3 GT 등)는 별도 페이지 → 별도 모델(familyKey 로 묶음). K8 택시 페이지는 K8 모델의 `영업용` 라인업으로 병합. 타스만 오픈베드는 타스만의 `상용/카고` 라인업.
- **카니발·하이리무진**: 기아 가격표가 하이브리드를 `파워트레인 선택품목(+4,550,000)` 으로 인쇄 → 차큐 UI/견적 연결(STEP 8)을 위해 **HEV 라인업으로 분리**하되, 공식 옵션가는 그대로 옵션 행(condition 에 "파워트레인 선택품목… 이 라인업에서는 기본 적용")으로 보존. 가솔린 라인업에서는 해당 옵션 제거.
- **KGM**: 액티언/액티언 하이브리드, 토레스/토레스 하이브리드/토레스 EVX 는 KGM 사이트 기준 별도 모델(familyKey 공유). 무쏘 스포츠/칸은 신형 무쏘(2026.1)로 대체 가능성 → `issues` 기록.
- **르노코리아**: 그랑 콜레오스는 하이브리드/가솔린 × escapade 4 라인업. 판매 종료(QM6/SM6/마스터/세닉) 제외.
- **쉐보레**: 트랙스 크로스오버·트레일블레이저 2종만 판매 중(콜로라도 런아웃, 트래버스/타호 판매 종료) → 2 모델.
- **GMC**: 시에라 드날리(+스칼렛 나이트) · 캐니언 · 아카디아 · 허머 EV SUV. 옵션/색상 추가금이 공식 문서에 없어 옵션 0.
- 범위 제외(차큐 렌트/리스 대상 아님): 봉고3(트럭·특장), 그랜버드, PV5 택시, 니로 플러스(2024 레거시), 코란도 EV 택시.
- 세대코드: 모든 신규 라인업 `generationCode: null`, `generationCodeVerified: false` (공식 문서 미표기). 세대명은 공식 가격표/페이지 제목 표기 그대로(예 "The 2027 Sorento", "더 뉴 티볼리").

## 4. 데이터 이슈 (원천 재확인 필요 — 전체는 `<brand>/out/final-build-log.json`, raw `issues[]`)

**기아**
- **EV9 4WD 4 트림 옵션가 27건 null**: HTML 가격 페이지가 2WD 탭만 노출, PDF 텍스트 레이어의 4WD 옵션 그리드는 호출마다 열이 어긋남 → 임의 매핑 대신 null + 원문 토큰 기록. 레이 2인승 밴 3건 동일.
- kia.com 가격 페이지는 첫 파워트레인 탭만 서버 렌더 → 나머지 탭 옵션가는 PDF 2~3회 일치 판독값(만원→원 변환). 일부 열 정렬 의심 항목은 issues 에 후보값과 함께 기록(스포티지 X-Line KRELL 59만, K5 2.0 스마트 셀렉션 선루프/드라이브 와이즈 순서 등).
- 승차정원·하이브리드 배터리 용량·완속 충전시간은 대부분 공식 텍스트에 없음 → null.
- 카니발 modelYear: 페이지 "The 2027 Carnival" 기준 2027, 카탈로그 표지는 2026.

**KG모빌리티** (공식 사이트가 JS SPA, 가격표 PDF 만 사용)
- **가격표 최신본 미확보**: 토레스/토레스 하이브리드(2026.5 뉴 토레스 출시 후 PDF 미색인 → 2025.12/2025.04 판 사용), 액티언·코란도(2025.3), 무쏘 EV(2025.3), 렉스턴·무쏘 스포츠/칸(2025.10). 티볼리(2026.1), 무쏘(2026.1), 토레스 EVX 2027(2026.5), 액티언 HEV 2027(2026.5) 은 최신.
- 토레스 EVX E7 옵션 3건 가격 null(열 매핑 불확실). 신형 무쏘 옵션 열 매핑은 행 순서+각주+리플릿으로 재구성(검토 필요 표시).

**르노코리아** (www 호스트 403 → cdn 호스트 사용)
- 2026-09 가격표 PDF 미색인 → 그랑 콜레오스/아르카나 2026.02(26MY), 필랑트 2026.05 판 사용. 2027년형 그랑 콜레오스(2026-09-01, esprit Alpine étoile) 트림·새틴 컬러는 미반영.
- 제원 페이지가 JS 전용 → 제원은 가격표 제원면 기준.

**쉐보레/GMC**: 트랙스 공차중량 미인쇄(2024.5 카탈로그 값은 issues 에만), 트레일블레이저 미드나잇 에디션은 Premier 옵션으로 기록(가격표 구조). GMC 는 가격표 PDF 없음(시에라만 미니 카탈로그 202609) → 옵션가·색상 추가금 0건, 제원은 카탈로그.

## 5. 제네시스 — 공식 웹서비스(GET API)로 구축, 가격표 PDF 는 미확보

- 다운로드 센터의 가격표/카탈로그 PDF 는 `POST /wsvc/kr/api/v2/downloadcenter/pdfdownload` + `file_key` 로만 내려주는 구조(사이트 JS `download-center/clientlibs.js` 확인). 이 환경의 도구는 GET 만 가능하고 외부 네트워크가 막혀 있어 PDF 는 받을 수 없음. BTO(견적) 옵션가 API 도 POST 전용.
- 대신 **공식 GET 웹서비스**를 사용: `wsvc/kr/api/v2/specVehicle/data`(모델별 파워트레인/변형 목록), `wsvc/kr/api/v2/spec/data`(변형별 제원 12항목 + 기본 사양 7분류 + "필수 선택 사양" + "선택 품목") + 모델 하이라이트 페이지(색상명). 출처 유형 `OFFICIAL_SITE`(Configurator/공식 사이트, 허용 출처).
- 구조: Lineup = 파워트레인(가솔린 2.5 터보 / 3.5 터보 / 48V e-S/C / 전기), Trim = 가격 행 변형(스탠다드 / 스포츠 패키지 / 그래파이트 에디션 / 퍼포먼스). 17 모델(G70·G70 SB·G80·Electrified G80·G80 Black·G90·G90 LWB·G90 Black·G90 LWB Black·GV60·GV60 Magma·GV70·Electrified GV70·GV80·GV80 Coupe·GV80 Black·GV80 Coupe Black), 31 라인업, 39 트림, 기본품목 평균 90개, 옵션 178종(필수 선택: AWD/매트 컬러/타이어&휠/디자인 셀렉션, 선택 품목: 파퓰러/컨비니언스/드라이빙 어시스턴스/파노라마 선루프/B&O 등), 제원 68.
- **미확보(null)**: 모든 옵션가·색상 추가금, 공차중량·연비(API 미제공, GV60 만 SSR 제원 페이지). 공식 정보 없음 → null 원칙 적용, `issues` 에 기록. 가격표 PDF 17종이 전달되면(수집기 페이지 2번 절차) 옵션가·색상 추가금·연비를 채우는 재빌드만 하면 됨(구조 변경 없음).
- 데이터 이상 기록: GV80 Black 의 spec API 가 G80 Black 세단 내용을 반환(오염) → 기본품목/제원 비움; Black 모델 하이라이트 페이지가 일반 모델 내용을 렌더 → 색상 미확인; GV80 일반형에 48V e-SC 변형 없음(SOURCE_CATALOG 표기와 상이).
- 옵션가 대안 탐색: 제네시스 뉴스룸/현대차그룹 뉴스룸 공식 보도자료 17건(2024.9~2026.7)을 전수 확인 — 전부 차량 기본가만 명시, 옵션/패키지/색상 가격 없음 → 적용 0건(`genesis/press-option-prices.json`). GET 변형(`pdfview?file_key`, `pdfdownload?file_key`)도 404. 옵션가는 가격표 PDF 전달 시에만 채울 수 있음.
- 이미지: Commons API 접근 불가 → WebSearch(`site:commons.wikimedia.org`)로 후보 33건을 12 그룹에 등록, 규칙대로 **LICENSE_NOT_VERIFIED**(30 라인업; GV60 마그마는 컨셉카만 존재 → NOT_FOUND). 노출 없음. `commons-search-step5c.html` 결과가 오면 즉시 판정.

## 6. 이미지 (2026-09-24 Commons 카테고리 스윕 2회 반영)

- 방법: 현대와 동일 — 사용자 PC 에서 `commons-search-step5.html`(1차, 8 그룹까지 수신 후 Commons 요청 제한) + `commons-search-step5b.html`(2차, 요청 간격·재시도 추가, 37 그룹) 실행 → Action API `imageinfo+extmetadata` 원문 JSON 을 `<brand>/api-responses/` 에 두고 `tools/vm-verify-images.js`(브랜드 범용) 로 판정. 후보 선정은 그룹당 ≤3장, 실내/크롭/위장/컨셉/택시 제외, 세대·페이스리프트 표기(PE/PE2/FL/코드) 기준.
- **결과: 국산 신규 98 라인업 중 VERIFIED 91 · REVIEW_REQUIRED 4 · NOT_FOUND 3** (이미지 280장 판정, VERIFIED 224). 라이선스 문제 0건(전부 CC BY-SA 4.0 / CC BY 4.0 / CC0, 작가·LicenseUrl 확인, NonFree/Restrictions 없음).
- REVIEW_REQUIRED (세대/파생 판별 사유): 니로(Commons 에 SG2 초기형만, "The new Niro" 페이스리프트 표기 없음), PV5 카고 컴팩트(카고 롱 사진만 존재), KGM 액티언 하이브리드·토레스 하이브리드(가솔린 사양 사진만 — 외관 동일 세대, 운영 판단 시 승격 가능).
- NOT_FOUND: EV3 GT · EV4 GT · EV5 GT (Commons 에 GT-Line 만 존재, 고성능 GT 사진 없음 — 2026-09-24 기준).
- 세대코드 보조 매핑 추가(Commons 파일명·카테고리 기준, `generationCodeVerified=false`): 기아 JA/TA/DL3/GL3/RJ/SP3/SG2/NQ5/MQ4/TK/KA4/SV/CT/OV/CV/MV/SW, KGM C300/J120/J100/U100/Y451/Q300/Q250/O100, 르노 필랑트 AR2. 모델명 별칭(구 모델명) 매핑: 무쏘 스포츠/칸 ← 렉스턴 스포츠(칸), 트랙스 크로스오버 ← Trax.
- 표시: VERIFIED 라인업은 Commons 썸네일, 나머지는 `car-placeholder.svg` (Playwright 확인).

## 7. 산출물

- `chaq_data_v165_step5_domestic-images.zip` — 6개 브랜드 통합 `vehicle-master.js` + 이미지 검증 반영 (제네시스 제외), 화면 변경 없음
- `domestic-pipeline.zip` — kia/kgm/renault/chevrolet/gmc (SOURCE_CATALOG, raw2, brand-config, out) + tools (vm-build-brand.js, vm-merge.js, 템플릿, Commons 그룹)
- `vehicle-master.js` / `.json` (통합), `commons-search-step5.html`, 본 보고서

## 8. 다음
- 사용자(선택): ① `commons-search-step5c.html` 실행 결과 첨부 → 제네시스 이미지 검증 ② 제네시스 가격표 PDF 17종 전달 → 옵션가 채움
- 이후: 제네시스 추출·병합 → 이미지 검증 반영 → STEP 5 마감 보고 → `STEP 6 진행`(수입차)
