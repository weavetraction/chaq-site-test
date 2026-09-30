# 차큐 Vehicle Master — PILOT 데이터 가이드

> **상태: PILOT (FINAL 아님)**
> 현대자동차 실데이터(STEP 2)를 넣어본 뒤 STEP 3에서 구조를 수정·확정한다.
> 구조상 표현이 안 되는 항목은 이 스키마를 몰래 바꾸지 말고 `SCHEMA_ISSUES`(STEP 2 리포트)에 먼저 기록한다.

---

## 0. 역할 분리 원칙

| 구분 | 데이터 | 전역 객체 | 파일 | 답하는 질문 |
|---|---|---|---|---|
| **Vehicle Master** | 브랜드·모델·라인업·트림·옵션·색상·제원·이미지·출처 | `window.CHAQ_VEHICLE_MASTER` | `pages/data/vehicle-master.js` | **차량이 무엇인가** |
| **Quote / Finance / Stock** | vehiclePrice·금융사·월납입금·계약기간·주행거리·초기비용·잔존가치·재고·프로모션 | `window.CHAQ` (stock/fast/estimate) | `pages/data/quotes.js` | **얼마에 어떤 조건인가** |

- 두 데이터는 섞지 않는다. 연결 키는 **Quote 레코드의 `trimId`** 하나뿐이다(STEP 8).
- **Vehicle Master에는 차량 판매가격을 저장하지 않는다.** 기존 `base`(basePrice)는 Vehicle Master 필수값이 아니며, 차량가는 향후 Quote의 `vehiclePrice`로만 받는다.
- 제조사 **공식 옵션가격**(`trimOptions.price`)과 **색상 추가금**(`trimColors.extraPrice`)만 Vehicle Master에 둘 수 있다.

---

## 1. 파일 구성 / 로딩 (file:// 호환)

```
pages/data/vehicle-master.js          window.CHAQ_VEHICLE_MASTER  (데이터, 동기 전역 주입)
pages/data/vehicle-master-helper.js   window.CHAQ_VM              (접근 Helper, ES5)
tools/vm-validate.js                  node 검증 스크립트 (Helper의 validate() 재사용)
```

각 HTML은 다음 순서로 로드한다 (index.html·car-select__master·car-detail·special-price-car__list·mypage 에 이미 삽입됨).

```html
<script src="data/quotes.js"></script>                 <!-- Quote/Finance/Stock (기존) -->
<script src="data/vehicle-master.js"></script>         <!-- Vehicle Master -->
<script src="data/vehicle-master-helper.js"></script>  <!-- Helper -->
```

- JSON `fetch` 를 쓰지 않는다 (file:// 더블클릭 실행 유지).
- 화면 코드는 `CHAQ_VEHICLE_MASTER` 를 직접 순회하지 않고 **`CHAQ_VM` 만** 사용한다.
- API 전환 시: `CHAQ_VM.load(apiResponse)` 한 줄로 소스 교체. 화면 코드 수정 없음.

---

## 2. 데이터 구조 (계층)

```
Brand
 └─ Model
     └─ Lineup   (세대 · 연식 · 유종 구분용 내부 단위 — 사용자 선택 단계 아님)
         └─ Trim (최종 선택 단위 = trimId)
             ├─ trimOptions ── options
             ├─ trimColors  ── colors
             └─ vehicleSpecs (trim 우선, 없으면 lineup 공통)
 vehicleImages : Lineup 기본 단위, 필요 시 trimId 로 특정 트림 전용
 sources       : 모든 엔티티가 sourceIds[] 로 참조
```

사용자 UI는 v158 그대로 **브랜드 → 모델 → 등급** 3단계다. Lineup 선택 단계를 추가하지 않는다.
등급 목록은 `CHAQ_VM.getTrimsByModel(modelId)` 로 라인업을 펼쳐서 보여주고, 동일 트림명이 여러 라인업에 있으면 `CHAQ_VM.trimLabel(trimId)` 가 `2026년형 · 익스클루시브` / `2027년형 · 익스클루시브` 식으로 구분한다.

---

## 3. 필드 정의

범례: **필수** / 선택 / `enum`

### 3-1. brands
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | ID 규칙 §4 |
| nameKo | string | **필수** | 현대 |
| nameEn | string | **필수** | Hyundai (Wikimedia 검색 키) |
| country | string | 선택 | ISO 2자리 (KR, DE, JP, US …) |
| domesticImport | `DOMESTIC` \| `IMPORT` | **필수** | v158 `gu`(국산/수입) 대응 |
| officialSite | string | 선택 | 대한민국 공식 사이트 URL |
| status | `ACTIVE` \| `DISCONTINUED` \| `UPCOMING` | **필수** | |
| sortOrder | number | 선택 | 노출 순서 |
| sourceIds | string[] | 권장 | |

### 3-2. models
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | |
| brandId | string | **필수** | → brands.id |
| nameKo | string | **필수** | 그랜저 (UI 모델명 — "더 뉴", "디 올 뉴" 같은 세대 수식어는 넣지 않고 lineup.generationName 에 둔다) |
| nameEn | string | **필수** | Grandeur |
| bodyType | string | 선택 | SEDAN / SUV / MPV / HATCHBACK / VAN / PICKUP / COUPE / WAGON 등 (Pilot에서는 자유 문자열, STEP 3에서 enum 검토) |
| status | enum | **필수** | |
| sortOrder, sourceIds | | 선택 | |

### 3-3. lineups
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | |
| modelId | string | **필수** | → models.id |
| displayName | string | **필수** | 화면 보조 표기. 예 `2026년형 가솔린 2.5`, `더 뉴 그랜저 HEV 1.6T` (v158 `year` 필드 역할) |
| generationName | string | 선택 | 제조사 세대 명칭. 예 `더 뉴 그랜저`, `디 올 뉴 싼타페` |
| generationCode | string | 선택 | 제조사 코드. 예 `GN7`, `MX5` (Wikimedia 검색 키) |
| modelYear | number | **필수** | 2026 |
| fuelType | `GASOLINE` `DIESEL` `LPG` `HEV` `PHEV` `EV` `HYDROGEN_FCEV` `ETC` | **필수** | |
| engineSummary | string | 선택 | `가솔린 2.5`, `1.6T HEV`, `롱레인지` |
| status | enum | **필수** | 현재 판매 여부 |
| imageStatus | `VERIFIED` `REVIEW_REQUIRED` `NOT_FOUND` `NOT_SEARCHED` `LICENSE_NOT_VERIFIED` | **필수** | §7 |
| sortOrder, sourceIds | | 선택 | |

### 3-4. trims — **차량가격 필드 없음**
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | 최종 선택 키 |
| lineupId | string | **필수** | → lineups.id |
| name | string | **필수** | 익스클루시브 / 캘리그래피 |
| status | enum | **필수** | |
| sortOrder | number | 선택 | 가격표 순서 |
| sourceIds | string[] | 권장 | |

`basePrice` / `price` / `vehiclePrice` 가 trims 에 있으면 `validate()` 가 **에러**로 잡는다.

### 3-5. options / trimOptions
options: `id` **필수**, `name` **필수**, `description` 선택

trimOptions (복합키 trimId+optionId):
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| trimId | string | **필수** | |
| optionId | string | **필수** | |
| price | number \| null | 선택 | 제조사 공식 옵션가(원). 기본품목이면 0 또는 null |
| type | `STANDARD` \| `SELECTABLE` | **필수** | 기본품목 / 선택옵션 |
| dependency | string[] | 선택 | 선행 필요 optionId 목록 |
| exclusionRule | string[] | 선택 | 동시 선택 불가 optionId 목록 |

옵션 패키지(여러 품목 묶음)는 Pilot에서는 **하나의 option** 으로 등록하고 `description` 에 구성품을 적는다. 패키지↔개별품목 계층이 필요하면 SCHEMA_ISSUES 에 기록.

### 3-6. colors / trimColors
colors: `id` **필수**, `name` **필수**, `hex` 선택(**공식 HEX 없으면 null, 임의 생성 금지**), `manufacturerCode` 선택(제조사 색상코드)

trimColors (복합키 trimId+colorId+type):
| 필드 | 타입 | 필수 |
|---|---|---|
| trimId | string | **필수** |
| colorId | string | **필수** |
| type | `EXTERIOR` \| `INTERIOR` | **필수** |
| extraPrice | number | 선택 (기본 0) |

내·외장 조합 제약(특정 외장에만 허용되는 내장)은 Pilot 스키마에 없다 → 발생 시 SCHEMA_ISSUES.

### 3-7. vehicleSpecs
`id` **필수**, `trimId` 또는 `lineupId` 중 **하나 필수** (trim 제원 우선, 없으면 lineup 공통).
모든 값은 **공식 자료가 있을 때만** 입력, 없으면 `null`. 추정 금지.

| 그룹 | 필드 |
|---|---|
| 공통 | engine, displacementCc, drivetrain(2WD/AWD/4WD), transmission, seatCount, horsepower, torque, combinedEfficiency, curbWeightKg |
| dimensions | lengthMm, widthMm, heightMm, wheelbaseMm |
| ev (EV/PHEV) | batteryCapacityKwh, electricRangeKm, motorPowerKw, electricEfficiency |
| fcev | hydrogenTankKg, fuelCellStackPowerKw, motorPowerKw, rangeKm, efficiencyKmPerKg |
| 메타 | sourceIds[] |

단위: 마력 ps, 토크 kgf·m, 연비 km/L (EV는 km/kWh), 중량 kg. 단위가 다른 공식값은 원문 단위를 `note` 에 남긴다.
복수 공차중량(옵션·인승별) 같은 "하나의 값으로 못 넣는" 경우는 억지로 넣지 말고 SCHEMA_ISSUES 에 기록.

### 3-8. vehicleImages
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | |
| lineupId | string | **필수** | 이미지 기본 단위 |
| trimId | string \| null | 선택 | 특정 트림 전용 이미지일 때만 |
| imageUrl | string | **필수** | 원본(또는 큰 사이즈) URL |
| thumbnailUrl | string \| null | 선택 | |
| source | string | **필수** | `WIKIMEDIA_COMMONS` / `CHAQ_INTERNAL` / `OFFICIAL_PRESS` … |
| sourceUrl | string | **필수(verified 시)** | Commons 파일 페이지 URL |
| filename | string | 선택 | Commons 파일명 |
| author | string | **필수(verified 시)** | 저작자 |
| license | string | **필수(verified 시)** | `CC BY-SA 4.0` 등 상업적 이용 가능 라이선스만 |
| licenseUrl | string | 선택 | |
| attribution | string | 권장 | 화면 표기용 크레딧 문자열 |
| verified | boolean | **필수** | 모델·세대·라이선스·저작자 확인 완료 = true |
| sortOrder | number | 선택 | |

### 3-9. sources
| 필드 | 필수 | 설명 |
|---|---|---|
| id | **필수** | `src-<brand>-<종류>-<yyyymm>` |
| type | **필수** | `OFFICIAL_SITE` `OFFICIAL_PRICE_LIST` `OFFICIAL_CATALOG` `OFFICIAL_CONFIGURATOR` `OFFICIAL_PRESS` `PUBLIC_DATA` `WIKIMEDIA_COMMONS` `CHAQ_INTERNAL` |
| title | **필수** | 예 `현대자동차 그랜저 가격표 2026.09` |
| url | 권장 | |
| publisher | 권장 | 현대자동차 |
| retrievedAt | **필수** | `YYYY-MM-DD` |
| note | 선택 | 페이지 번호, 버전 등 |

사용 금지 출처: 네이버자동차, 카이즈유, 다나와자동차, 기타 상용 자동차 DB 복제.

---

## 4. ID 규칙

- 소문자 영문·숫자·하이픈만 사용 (`[a-z0-9-]`). 한글·공백·대문자 금지.
- 계층 ID는 상위 ID를 접두어로 포함한다 (충돌 방지 + 사람이 읽기 쉬움).

| 엔티티 | 규칙 | 예 |
|---|---|---|
| brand | `<brandSlug>` | `hyundai`, `kia`, `genesis`, `kgm`, `renault-korea`, `chevrolet`, `bmw`, `mercedes-benz` |
| model | `<brandId>-<modelSlug>` | `hyundai-grandeur`, `hyundai-santa-fe`, `hyundai-ioniq-5` |
| lineup | `<modelId>-<generationCode\|gen>-<modelYear>-<fuelSlug>` | `hyundai-grandeur-gn7-2026-gasoline`, `hyundai-grandeur-gn7-2026-hev` |
| trim | `<lineupId>--<trimSlug>` (구분자 `--`) | `hyundai-grandeur-gn7-2026-gasoline--exclusive` |
| option | `<brandId>-opt-<slug>` | `hyundai-opt-hyundai-smartsense-2` |
| color | `<brandId>-color-<manufacturerCode \| slug>` | `hyundai-color-a2b`, `hyundai-color-abyss-black-pearl` |
| spec | `spec-t-<trimId>` / `spec-l-<lineupId>` | |
| image | `img-<lineupId>-<n>` | `img-hyundai-grandeur-gn7-2026-gasoline-1` |
| source | `src-<brandId>-<type>-<yyyymm>` | `src-hyundai-pricelist-202609` |

fuelSlug: gasoline · diesel · lpg · hev · phev · ev · fcev · etc
같은 라인업 안에서 트림 slug 가 겹치면(2WD/AWD, 5인승/7인승 등) 접미어를 붙인다: `--exclusive-awd`, `--noblesse-7seat`.

---

## 5. 차량 추가 방법 (순서)

1. **source** 먼저 등록 (가격표·카탈로그·홈페이지 URL + retrievedAt).
2. **brand** 가 없으면 추가.
3. **model** 추가 (nameKo 는 세대 수식어 제외).
4. **lineup** 추가 — 세대·연식·유종이 하나라도 다르면 별도 lineup. `imageStatus` 는 **`NOT_SEARCHED`** 로 시작.
5. **trim** 추가 — 가격표 순서대로 `sortOrder`. **가격은 넣지 않는다.**
6. options / colors 를 브랜드 단위로 등록한 뒤 trimOptions / trimColors 로 연결.
7. vehicleSpecs 입력 (공식값만).
8. 이미지 검색 → §7 절차대로 상태 확정.
9. `node tools/vm-validate.js` 실행 → errors 0 확인.

---

## 6. 옵션 / 색상 연결법

```js
// 옵션 (브랜드 단위 1회 등록 → 트림별 연결)
options:     [{ id:"hyundai-opt-sunroof", name:"파노라마 선루프", description:"" }]
trimOptions: [{ trimId:"hyundai-grandeur-gn7-2026-gasoline--exclusive", optionId:"hyundai-opt-sunroof",
                price:1200000, type:"SELECTABLE", dependency:[], exclusionRule:[] }]

// 색상
colors:     [{ id:"hyundai-color-a2b", name:"어비스블랙펄", hex:null, manufacturerCode:"A2B" }]
trimColors: [{ trimId:"…--exclusive", colorId:"hyundai-color-a2b", type:"EXTERIOR", extraPrice:0 }]
```

- 같은 옵션이 트림마다 가격이 다르면 **trimOptions.price** 에 트림별로 적는다 (options 에는 가격 없음).
- 기본품목은 `type:"STANDARD"`, `price:0`.
- 조회: `CHAQ_VM.getTrimOptions(trimId, "SELECTABLE")`, `CHAQ_VM.getTrimColors(trimId, "EXTERIOR")`

---

## 7. 이미지 연결법 / 상태 규칙

검색 키: `브랜드 영문명 + 모델 영문명 + generationCode` (예 `Hyundai Grandeur GN7`).
첫 결과를 자동 채택하지 않는다. 다음을 모두 확인한 뒤에만 `verified:true` + lineup `imageStatus:"VERIFIED"`:

1. 정확한 모델 2. 정확한 세대 3. 상업적 이용 가능 라이선스(CC BY / CC BY-SA / CC0 / Public domain) 4. 저작자 확인 5. 라이선스 확인

| imageStatus | 의미 |
|---|---|
| `NOT_SEARCHED` | **아직 검색하지 않음** (네트워크 문제로 조회 못 한 경우 포함) |
| `NOT_FOUND` | **검색했지만** 사용 가능한 이미지 없음 |
| `REVIEW_REQUIRED` | 후보는 있으나 모델/세대/라이선스 확인 미완 → **자동 노출 금지** |
| `LICENSE_NOT_VERIFIED` | 후보(File 명)는 확보했으나 네트워크/API 제한으로 **라이선스 조회를 수행하지 못함** → 후보 보존, 자동 노출 금지, API 접근 가능 시 재검증 |
| `VERIFIED` | 확인 완료 → 노출 |

`NOT_SEARCHED` ≠ `NOT_FOUND` ≠ `LICENSE_NOT_VERIFIED`. 절대 혼용하지 않는다.

라이선스 검증은 Commons 파일 페이지 열람이 아니라 **Action API** 로 한다:
`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json&titles=File:A|File:B`
확인 필드: Artist, Credit, LicenseShortName, LicenseUrl, UsageTerms, Attribution, AttributionRequired, Copyrighted, NonFree, Restrictions (+ imageinfo.url / thumburl). VERIFIED 는 브랜드·모델·세대 일치 + LicenseShortName·LicenseUrl 확인 + 상업적 이용 가능(CC BY / CC BY-SA / CC0 / Public Domain 등 실제 조건 기준) + Artist/Attribution 확인 + NonFree 아님 + Restrictions 없음 을 모두 충족할 때만. 복수 라이선스·세대 애매·Attribution 불완전·Restrictions 검토 필요 → REVIEW_REQUIRED. 파이프라인: `hyundai/verify-images.js`.

화면 노출 우선순위 (Helper `resolveImageUrl(trimId, [차큐직접이미지, placeholder])`):
1. trim VERIFIED → 2. lineup VERIFIED → 3. 차큐 직접 이미지 → 4. `assets/icons/car-placeholder.svg`

---

## 8. Source 저장법

- 모든 brand/model/lineup/trim 은 `sourceIds:[…]` 로 최소 1개 출처를 가진다 (없으면 validate 경고).
- 하나의 가격표 PDF/페이지 = source 1건. 여러 모델이 같은 가격표를 쓰면 같은 sourceId 를 공유.
- 이미지 출처는 vehicleImages 의 `source/sourceUrl/author/license` 에 직접 기록 (sources 테이블과 별도).
- `retrievedAt` 은 실제 조회일. 재검증 시 새 source 를 추가하고 sourceIds 에 덧붙인다(기존 삭제하지 않음).

---

## 9. Helper API 요약 (`window.CHAQ_VM`)

| 함수 | 반환 |
|---|---|
| `load(data)` | 소스 교체 (API 전환용) |
| `getBrands()` / `getBrand(id)` | ACTIVE 브랜드 목록 / 단건 |
| `getModels(brandId)` / `getModel(id)` | |
| `getLineups(modelId)` / `getLineup(id)` | |
| `getTrims(lineupId)` / `getTrim(id)` / `getTrimsByModel(modelId)` | 등급 UI 는 `getTrimsByModel` |
| `trimLabel(trimId)` | 동일 트림명 구분 라벨 (`2026년형 · 익스클루시브`) |
| `describe(trimId)` | brand/model/lineup/trim + fullName/fuelLabel/trimLabel |
| `getTrimOptions(trimId, type?)` / `getTrimColors(trimId, type?)` | option/color 조인 결과 |
| `getSpecs(trimId)` | trim 제원 → lineup 제원 fallback → null |
| `getPrimaryImage(trimId)` / `resolveImageUrl(trimId, fallbacks)` | VERIFIED 만 |
| `getSources(entity)` | sourceIds 조인 |
| `fromQuote(rec)` | rec.trimId 있으면 describe, 없으면 null (STEP 8) |
| `validate()` | `{ok, errors[], warnings[], counts, imageStatus}` |

`includeInactive:true` 옵션으로 단종 포함 조회 가능.

---

## 10. Pilot 에서 확인할 것 (STEP 2 체크리스트)

가격 구조 · 동일 트림명 다른 연식 · Lineup 구분 기준 · 옵션 패키지 계층 · 옵션 의존성/배타 · 내외장 색상 조합 제약 · 제조사 색상코드 · 복수 공차중량 · HEV/EV/FCEV 제원 · 승차인원별 트림 · 동일 차량 상이 제원 · 이미지 연결 · 단일 필드로 못 넣는 제조사 데이터

발견 즉시 `SCHEMA_ISSUES` 에 기록하고 스키마는 STEP 3 에서만 바꾼다.
