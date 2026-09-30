# 차큐 Vehicle Master — FINAL 데이터 가이드 (final-1.2)

> **Vehicle Master schema = FINAL LOCK (2026-09-23)**
> 현대 Pilot(STEP 2)에서 실제로 표현하지 못한 항목만 최소 확장했다. 기본 관계 `Brand → Model → Lineup → Trim → Option / Color → Specs / Image` 는 그대로다.
> 이후 단계(STEP 4~9)에서는 이 스키마를 변경하지 않는다. 변경이 필요하면 별도 버전(final-1.1)으로 제안하고 승인 후 적용한다.
>
> **final-1.2 (2026-09-29, 사용자 지시 반영)** — 차량 데이터를 사용자 제공 파일 `차량모델_색상트림옵션`(차량목록·트림·색상·옵션) 기준으로 교체(`tools/vm-import-xlsx.py`, 보고서 `STEP11_DATA_FILE_IMPORT_REPORT.md`). 추가 필드: `trims.listPrice`(트림 기본가, 파일 기준 기본값 — 화면은 견적 차량가 우선, `tools/vm-price-from-quotes.js` 로 견적 기준 수정 가능)·`listPriceBeforeTaxBenefit`·`listPriceBasis`·`listPriceSource`(FILE/MANUAL/QUOTE)·`listPriceDate`·`extId`·`fileTrimName`, `models.segment`·`extId`. 차량 이미지 = 모델별 1장 `assets/vehicles/<모델id>--cur/default.webp`. Helper `getListPrice(trimId)`·`getTrimPrice(trimId, rec)`.
>
> **final-1.1 (2026-09-28, 사용자 지시 반영)** — ① 노출 범위를 사용자 지정 모델(+파생)로 한정 `scope/scope-models.json` ② 외부 이미지(위키미디어·뉴스룸) 사용 중단 → **차큐 자체 제작 이미지만** (세대 × 외장색) ③ 외부 추적 범위 = 브랜드·모델·연식·트림·옵션(+색상·기본품목). **제원(vehicleSpecs)은 비움** ④ 추가 필드: `lineups.imageKey`, `vehicleImages.colorKey`·`view`. 나머지 필드·관계는 그대로.

---

## 0. 원칙 (변경 없음)

| 구분 | 답하는 질문 | 전역 | 파일 |
|---|---|---|---|
| **Vehicle Master** | 차량이 무엇인가 | `window.CHAQ_VEHICLE_MASTER` | `pages/data/vehicle-master.js` |
| **Quote / Finance / Stock** | 얼마에 어떤 조건인가 | `window.CHAQ` | `pages/data/quotes.js` |

- 연결 키는 **Quote 의 `trimId`** 하나(STEP 8). 두 데이터를 섞지 않는다.
- **차량 판매가격은 Vehicle Master 에 없다.** `trims`/`lineups` 에 `basePrice`/`price`/`vehiclePrice`/`salePrice` 가 있으면 `validate()` 에러. 차량가는 Quote 의 `vehiclePrice`.
- 저장 가능한 가격: 제조사 공식 **옵션가**(`trimOptions.price`), **색상 추가금**(`trimColors.extraPrice`).
- 공식 자료에 없는 값은 `null`. 추정 금지. 출처 금지 목록: 네이버자동차·카이즈유·다나와·상용 DB 복제.
- file:// 동기 전역 주입 유지. JSON fetch 없음. 화면은 `window.CHAQ_VM`(Helper)만 사용.

---

## 1. Pilot → FINAL 변경 요약

| # | 대상 | 변경 | Pilot 근거 |
|---|---|---|---|
| 1 | models | **모델 = 제조사가 별도 모델로 판매하는 단위**(예 `그랜저`, `그랜저 하이브리드`, `코나 일렉트릭`은 각각 모델). `familyKey` 로 패밀리 묶음. `bodyType` enum 화 | 등급 목록 15~21개, 금융사 데이터·제조사 사이트 표기와 일치 |
| 2 | lineups | `shortLabel`(필수), `salesChannel`(필수), `generationCodeVerified` 추가 | 라벨 중복 30건, 장애인/렌터카/영업용/상용 구분 |
| 3 | trims | `drivetrain`, `seatCount`, `variantNote`, `standardItems[]`, `nameEn` 추가. **가격표의 가격 행 1개 = 트림 1개** | 팰리세이드 인승·싼타페 AWD 행, 기본품목 1,666행 |
| 4 | options | `modelId`(스코프), `category`, `items[]`, `nameEn` 추가. 옵션은 모델 단위 | 동명 옵션의 구성·가격이 모델마다 다름 |
| 5 | trimOptions | `condition`, `dependencyNote`, `exclusionNote` 추가. `dependency`/`exclusionRule` 은 **optionId 만** | 조건 490건, 문장형 의존 |
| 6 | colors / trimColors | `brandId`, `nameEn`, `kind`(SOLID/TWO_TONE/MATTE) / `note` 추가 | 투톤 루프, 매트 추가금 |
| 7 | colorRules (신규) | 내장색 ↔ 외장색 허용/배제 규칙 | 쏘나타 네이비↔레드 등 |
| 8 | vehicleSpecs | `lineupId` 필수 + `trimIds[]`, `variant{wheelInch, builtInCam, seatCount, drivetrain, transmission}`, 출력/토크 숫자·rpm 분리, `hev{}`, EV 도심/고속·전후륜 모터·V/Ah, `efficiencyGrade`, `co2GPerKm`, `note` | 휠·인승·구동·빌트인캠별 복수 제원, HEV 모터, FCEV |
| 9 | vehicleImages | `matchConfidence`, `reviewNote` 추가. imageStatus 에 `LICENSE_NOT_VERIFIED` | 세대 판별 신뢰도, API 미접근 상태 |
| 10 | sources | 변경 없음. 제원은 **공식 카탈로그 PDF**를 정식 소스로 추가 사용 | 출력·토크·치수 null |

Helper 변경: `getTrimGroups()`(등급 팝업 섹션), `trimLabel()`이 `shortLabel` 사용, `getSpecs(trimId, variant)` 대표 제원 선택 + `getSpecList()`, `getStandardItems()`, `getColorRules()` / `allowedExteriorColors()`, `imageCredit()`, `load()` 가 pilot-0.1 데이터를 자동 변환.

---

## 2. 계층과 UI

```
Brand
 └─ Model            ← 제조사 판매 단위 (그랜저 / 그랜저 하이브리드 …), familyKey 로 묶음
     └─ Lineup       ← 세대·연식·엔진/배터리·인승·판매채널 구분 (사용자 선택 단계 아님)
         └─ Trim     ← 가격표 가격 행 = 트림, 최종 선택키 trimId
             ├─ standardItems[]           기본품목 문자열
             ├─ trimOptions ── options    선택품목 (모델 스코프)
             ├─ trimColors  ── colors     외장/내장 색상, colorRules 로 조합 제약
             └─ vehicleSpecs (lineupId + trimIds[] + variant)
 vehicleImages : Lineup 단위 (trimId 로 트림 전용 가능)
 sources       : 엔티티/제원 레코드가 sourceIds[] 로 참조
```

UI 는 v158 그대로 **브랜드 → 모델 → 등급**. 등급 팝업은 `CHAQ_VM.getTrimGroups(modelId)` 로 라인업별 섹션 헤더(`shortLabel`)를 붙여 렌더링(기존 `.fpop_sec` 재사용). 라인업이 1개면 헤더 생략. 동일 트림명이 다른 라인업에도 있으면 `trimLabel()` 이 `shortLabel · 트림명` 으로 표기.
채널 필터: `getLineups(modelId, { salesChannels: ["GENERAL", "RENTAL"] })` — 장기렌트 화면은 기본적으로 `GENERAL` + `RENTAL` 만 노출하고 `DISABLED`/`BUSINESS`/`DRIVING_SCHOOL`/`COMMERCIAL` 은 숨긴다(STEP 4 적용 시 결정).

---

## 3. 필드 정의 (범례: **필수** / 선택 / `enum`)

### brands
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | `hyundai`, `kia`, `genesis`, `kgm`, `renault-korea`, `chevrolet`, `bmw` … |
| nameKo / nameEn | string | **필수** | 현대 / Hyundai |
| country | string | 선택 | ISO2 |
| domesticImport | `DOMESTIC` `IMPORT` | **필수** | |
| officialSite | string | 선택 | |
| status | `ACTIVE` `DISCONTINUED` `UPCOMING` | **필수** | |
| sortOrder, sourceIds[] | | 선택/권장 | |

### models
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | `hyundai-grandeur`, `hyundai-grandeur-hybrid`, `hyundai-kona-electric` |
| brandId | string | **필수** | |
| nameKo / nameEn | string | **필수** | `그랜저 하이브리드` / `Grandeur Hybrid` — 제조사 공식 표기. 세대 수식어(더 뉴/디 올 뉴)는 넣지 않음 |
| bodyType | `SEDAN` `SUV` `MPV` `HATCHBACK` `COUPE` `WAGON` `VAN` `PICKUP` `CONVERTIBLE` `ETC` | **필수** | |
| familyKey | string | 권장 | 패밀리 묶음 키. 예 `hyundai-grandeur` (그랜저·그랜저 하이브리드 공통) |
| status, sortOrder, sourceIds[] | | | |

**모델 분리 기준**: 제조사 공식 라인업 페이지/가격표에서 별도 모델로 제시되면 별도 모델(파워트레인 변형 포함). 같은 모델 안의 엔진 배기량·배터리 용량·인승 차이는 Lineup.

### lineups
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | `<modelId>-<gencode>-<MY>-<fuel>[-suffix]` |
| modelId | string | **필수** | |
| displayName | string | **필수** | 상세 표기 `2026년형 가솔린 1.6 터보` (v158 `year` 역할) |
| shortLabel | string | **필수** | 등급 팝업 섹션/구분용 **짧은** 라벨: `가솔린 1.6 터보`, `LPG`, `롱레인지`, `7인승`, `투어러 11인승`. 같은 모델 안에서 유일해야 함(중복 시 연식 접두) |
| generationName | string | 선택 | `더 뉴 그랜저` |
| generationCode | string | 선택 | `GN7`. 공식 자료에 없으면 내부 매핑 허용하되 아래 플래그 false |
| generationCodeVerified | boolean | **필수** | 공식 자료(보도자료·카탈로그 등)로 확인 시 true |
| modelYear | number | **필수** | 미표기면 출시일 연도 + sources.note 에 "MY 미표기" |
| fuelType | `GASOLINE` `DIESEL` `LPG` `HEV` `PHEV` `EV` `HYDROGEN_FCEV` `ETC` | **필수** | |
| engineSummary | string | 선택 | `스마트스트림 가솔린 2.5`, `84.0kWh 롱레인지` |
| salesChannel | `GENERAL` `RENTAL` `BUSINESS` `DISABLED` `DRIVING_SCHOOL` `COMMERCIAL` | **필수** | 일반판매 / 렌터카용 / 영업용(택시) / 장애인용 / 운전교습용 / 상용(카고·킨더·특장) |
| status | enum | **필수** | 현재 판매 여부 |
| imageStatus | `VERIFIED` `REVIEW_REQUIRED` `NOT_FOUND` `NOT_SEARCHED` `LICENSE_NOT_VERIFIED` | **필수** | §7. final-1.1: 자체 제작 이미지 있으면 VERIFIED, 없으면 NOT_FOUND |
| imageKey | string | **필수**(1.1) | 자체 제작 이미지 폴더 = 디자인 세대 키 `<modelId>--<세대코드 소문자|cur>` 예 `kia-sorento--mq4`. 같은 세대의 라인업·연식은 같은 키. 예외(부분변경 전/후 분리 등)는 `scope/image-key-overrides.json` |
| sortOrder, sourceIds[] | | | |

### trims — 차량가격 없음
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | `<lineupId>--<trimSlug>[-awd|-7seat]` |
| lineupId | string | **필수** | |
| name | string | **필수** | 가격표 원문. 가격 행이 구동/인승으로 분리돼 있으면 이름에 포함: `익스클루시브 AWD`, `프레스티지 7인승` |
| nameEn | string | 선택 | |
| drivetrain | `2WD` `AWD` `4WD` \| null | 선택 | 트림 자체가 구동 고정일 때. 옵션(HTRAC)으로 선택하는 경우 null |
| seatCount | number \| null | 선택 | 트림 고정 인승. 옵션으로 바꾸는 경우 null |
| variantNote | string \| null | 선택 | 변속기 선택, 장애유형 등 트림으로 나누지 않은 변형 메모 |
| standardItems | string[] | **필수**(빈 배열 허용) | 기본품목 원문 목록 |
| status, sortOrder, sourceIds[] | | | |

### options
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | string | **필수** | `<brandId>-opt-<modelSlug>-<slug>` |
| modelId | string | **필수** | 옵션 스코프 = 모델 |
| name | string | **필수** | 원문 |
| nameEn | string | 선택 | |
| category | `PACKAGE` `ITEM` `POWERTRAIN` `DRIVETRAIN` `SEAT` `WHEEL` `ACCESSORY` `ETC` | **필수** | 엔진 선택=POWERTRAIN, HTRAC=DRIVETRAIN, 6/7인승=SEAT, 휠=WHEEL, H Genuine 등=ACCESSORY |
| description | string | 선택 | 구성품 원문 |
| items | string[] | 선택 | 구성품 분해 목록 |

### trimOptions (복합키 trimId+optionId)
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| trimId, optionId | string | **필수** | |
| price | number \| null | 선택 | 공식 옵션가(원). 미확인 null |
| type | `SELECTABLE` `STANDARD` | **필수** | 기본은 SELECTABLE. 이름 있는 기본 패키지만 STANDARD(price 0) |
| condition | string \| null | 선택 | 선택 조건 원문 (`가솔린 3.5 선택 시`, `DCT 전용`) |
| dependency / exclusionRule | optionId[] | 선택 | **optionId 만** (validate 강제) |
| dependencyNote / exclusionNote | string \| null | 선택 | optionId 로 못 푼 문장형 조건 |

### colors / trimColors / colorRules
colors: `id` **필수** (`<brandId>-color-<code|slug>`), `brandId` 권장, `name` **필수**, `nameEn`, `hex`(공식 없으면 null), `manufacturerCode`, `kind` `SOLID` `TWO_TONE` `MATTE` `ETC`
trimColors: `trimId` `colorId` `type`(`EXTERIOR`|`INTERIOR`) **필수**, `extraPrice` number|null (트림별로 다르면 트림별 행에 각각), `note`
colorRules: `trimId` `interiorColorId` **필수**, `allowedExteriorColorIds[]` 또는 `excludedExteriorColorIds[]`, `note`. 규칙이 없으면 트림의 전체 외장색 허용.

### vehicleSpecs
| 필드 | 설명 |
|---|---|
| id, lineupId **필수**, trimIds[] | trimIds 비면 라인업 공통 |
| variant | `{ wheelInch, builtInCam, seatCount, drivetrain, transmission }` — 연비/공차중량이 갈리는 조건 키 |
| engine, displacementCc, drivetrain, transmission, seatCount | |
| maxPowerPs, maxPowerRpm, maxPowerText / maxTorqueKgfm, maxTorqueRpm, maxTorqueText | 숫자 + rpm 문자열 + 원문 |
| combinedEfficiency, efficiencyUnit(`km/L` `km/kWh` `km/kg`), efficiencyCity, efficiencyHighway, efficiencyGrade, co2GPerKm, curbWeightKg | |
| dimensions { lengthMm, widthMm, heightMm, wheelbaseMm } | |
| hev { motorPowerKw, systemPowerPs } | HEV/PHEV |
| ev { batteryCapacityKwh, batteryVoltage, batteryAh, electricRangeKm, electricRangeCityKm, electricRangeHighwayKm, motorPowerKw, motorPowerFrontKw, motorPowerRearKw, electricEfficiency, electricEfficiencyCity, electricEfficiencyHighway } | EV/PHEV |
| fcev { hydrogenTankKg, fuelCellStackPowerKw, motorPowerKw, rangeKm, efficiencyKmPerKg } | FCEV |
| note, sourceIds[] | 제원 레코드마다 출처 |

대표 제원 선택: `getSpecs(trimId)` = 트림 지정 > 트림의 구동/인승 일치 > 빌트인캠 없음 > 첫 레코드. 전체는 `getSpecList(trimId, {wheelInch: 19})`.

### vehicleImages
Pilot 필드 + `matchConfidence`(`HIGH` `MEDIUM` `LOW`), `reviewNote`. `verified:true` 조건은 §7. verified 이미지는 `license` `licenseUrl` `author` `sourceUrl` 필수, `matchConfidence` 는 HIGH.

### sources
변경 없음: `id` `type`(`OFFICIAL_SITE` `OFFICIAL_PRICE_LIST` `OFFICIAL_CATALOG` `OFFICIAL_CONFIGURATOR` `OFFICIAL_PRESS` `PUBLIC_DATA` `WIKIMEDIA_COMMONS` `CHAQ_INTERNAL`) `title` `url` `publisher` `retrievedAt` `note`. 세대코드 내부 매핑은 `CHAQ_INTERNAL` 소스 + `generationCodeVerified:false`.

---

## 4. ID 규칙 (Pilot 과 동일)

`[a-z0-9-]` 만. brand `hyundai` · model `hyundai-grandeur-hybrid` · lineup `hyundai-grandeur-hybrid-gn7-2027-hev` · trim `<lineupId>--exclusive`, `--exclusive-awd`, `--prestige-7seat` · option `hyundai-opt-grandeur-hybrid-<slug>` · color `hyundai-color-a2b` · spec `spec-l-<lineupId>-<n>` · image `img-<lineupId>-<n>` · source `src-<brand>-<type>-<yyyymm>`.
한글만 있는 이름은 KO_MAP(표준 트림명 영문) 또는 해시 슬러그.

---

## 5. 차량 추가 절차

1. source 등록(가격표·카탈로그 URL·조회일) → 2. brand → 3. **model** (제조사 판매 단위) → 4. **lineup** (`shortLabel`·`salesChannel`·`imageStatus: NOT_SEARCHED`) → 5. **trim** (가격 행마다, 가격은 넣지 않음, `standardItems`) → 6. options(모델 스코프)+trimOptions(condition) → 7. colors+trimColors(+colorRules) → 8. vehicleSpecs (가격표 연비표 + 카탈로그 제원표, variant 키) → 9. 이미지 §7 → 10. `node tools/vm-validate.js` errors 0.

---

## 6. 옵션 / 색상 연결 예

```js
options:     [{ id:"hyundai-opt-grandeur-htrac", modelId:"hyundai-grandeur", name:"HTRAC", category:"DRIVETRAIN", description:"전자식 상시 4륜 구동", items:[] }]
trimOptions: [{ trimId:"…--exclusive", optionId:"hyundai-opt-grandeur-htrac", price:2180000, type:"SELECTABLE",
                condition:"스마트스트림 가솔린 3.5 엔진 선택 시", dependency:["hyundai-opt-grandeur-engine-3-5"], exclusionRule:[], dependencyNote:null, exclusionNote:null }]
colors:      [{ id:"hyundai-color-r2p", brandId:"hyundai", name:"얼티메이트 레드 메탈릭", hex:null, manufacturerCode:"R2P", kind:"SOLID" }]
trimColors:  [{ trimId:"…--inspiration", colorId:"hyundai-color-r2p", type:"EXTERIOR", extraPrice:0, note:null }]
colorRules:  [{ trimId:"…--inspiration", interiorColorId:"hyundai-color-navy", allowedExteriorColorIds:[], excludedExteriorColorIds:["hyundai-color-r2p"], note:"각주 원문" }]
```

---

## 7. 이미지 — 차큐 자체 제작 (final-1.1)

외부 이미지(위키미디어 Commons·뉴스룸)는 2026-09-28 부로 사용하지 않는다(과거 절차는 `.bak-own` 사본 참고). 이미지는 차큐가 직접 만든 파일만 쓴다.

1. **단위**: 디자인 세대(`lineups.imageKey`) × 외장색. 같은 세대의 연식·트림은 한 이미지를 공유.
2. **파일**: `chaq-doubleclick/assets/vehicles/<imageKey>/<colorKey>[__<view>].png|webp|jpg`
   - `colorKey` = 외장색 제조사 코드 소문자(`swp`), 코드가 없으면 color id 에서 `<brand>-color-` 를 뗀 값. 헬퍼 `colorKeyOf(color)` 와 같은 규칙.
   - `default.png` = 색상 무관 대표 이미지. `view` 생략 = `side`(측면). 예 `kia-sorento--mq4/swp.png`, `…/swp__front34.png`.
   - 무엇을 만들어야 하는지는 `merged/own-images-checklist.xlsx|csv` (빌드 때마다 보유 여부 갱신).
3. **매칭**: `node tools/vm-build-all.js` 의 [4-2] `tools/own-images.js` 가 폴더를 스캔해 `vehicleImages` 행을 만든다: `source:"CHAQ_OWN"`, `imageUrl` = 사이트 루트 기준 `assets/vehicles/…`, `author:"차큐"`, `license:"차큐 자체 제작"`, `licenseUrl/sourceUrl: null`, `verified:true`, `matchConfidence:"HIGH"`, `colorKey`(default 는 null), `view`, `sortOrder`(default 0, 색상 1). 규칙에 안 맞는 파일은 `merged/own-images-report.json` 의 `unknownImageKey/unknownColorKey`.
4. **노출**: trim 이미지 → lineup 이미지, 각 단계에서 **colorKey 일치 → default → 첫 이미지**, 없으면 placeholder. 크레딧 표기 없음(`imageCredit` = null).
5. **상세 페이지**: 초기 색 = 재고 견적의 실차 색상(이름 일치, `colorKeyByName`) → 기본 색(추가금 0 첫 색). 옵션선택 팝업 색상 행에 `data-color-key`, 누르면 그 색 이미지로 교체(없으면 유지). 레이아웃 변경 없음.

---

## 8. Helper API (`window.CHAQ_VM`)

| 함수 | 반환 |
|---|---|
| `load(data)` | 소스 교체. pilot-0.1 → 자동 변환 |
| `getBrands()` `getBrand(id)` `getModels(brandId)` `getModel(id)` `getModelsByFamily(key)` | |
| `getLineups(modelId, {salesChannels, includeInactive})` `getLineup(id)` `lineupLabel(l)` | |
| `getTrims(lineupId)` `getTrim(id)` `getTrimsByModel(modelId, opt)` **`getTrimGroups(modelId, opt)`** | 등급 팝업 섹션 `[ {lineup, label, trims} ]` |
| `trimLabel(trimId)` `describe(trimId)` | 라벨/전체 계층 |
| `getStandardItems(trimId)` `getTrimOptions(trimId, type?)` | |
| `getTrimColors(trimId, type?)` `getColorRules(trimId)` `allowedExteriorColors(trimId, interiorColorId)` | |
| `getSpecs(trimId, variant?)` `getSpecList(trimId, variant?)` | 대표 1건 / 전체 |
| `getPrimaryImage(trimId, colorKey?, view?)` `getImages(lineupId)` `resolveImageUrl(trimId, fallbacks, preferThumb, colorKey?, view?)` `imageCredit(trimId)` | VERIFIED 만. colorKey 일치 → default → 첫 이미지. URL 은 `pages/` 하위에서 자동으로 `../` 보정 |
| `colorKeyOf(colorOrId)` `colorKeyByName(trimId, 색상명)` `getImageKey(trimId)` `getImageColorKeys(trimId)` `siteUrl(u)` | final-1.1 자체 제작 이미지용 |
| `getSources(entity)` `fromQuote(rec)` `validate()` | |
| `getQuotes(trimId)` `pickQuote(trimId, prefer)` | STEP 8 — 트림에 연결된 견적 / 대표 견적 1건 (월납입금 있는 견적 → 목록 종류 → 연식 일치 → 최신 연식 → 낮은 차량가) |
| `quoteView(rec)` | STEP 8 — 견적 우선 합성 뷰 `{name, yearLabel, trimLabel, vehiclePrice, quoteOptions, quoteColors, vmOptions, vmColors, standardItems, specs, image, sameYear, vmUsable, src{…}, notices[]}` |

---

## 9. 검증 (`node tools/vm-validate.js <file>`) — 에러 조건

중복 ID · 참조 무결성(모델/라인업/트림/옵션/색상/소스/trimIds/colorRules) · enum · 필수값(shortLabel, modelYear, standardItems 등) · **차량가격 필드** · dependency/exclusionRule 이 optionId 가 아님 · verified 외부 이미지(CHAQ_OWN 제외)의 license/licenseUrl/author/sourceUrl 누락 또는 matchConfidence≠HIGH · imageStatus=VERIFIED 인데 verified 이미지 없음 · **같은 모델 안 트림 라벨 중복**(shortLabel 부족) · 경고: sourceIds 없음, generationCode 미검증.

---

## 9-1. STEP 8~9 이후 운영 규칙
- **노출 범위**: `scope/scope-models.json` (브랜드 → 사용자 모델명 → VM 모델 id, 파생 포함). 목록 밖 모델은 병합 후 제거된다. 모델 추가 = raw2 수집 후 이 파일에 id 추가.
- **trimId 고정**: `tools/trim-id-registry.json` (819개, 2026-09-28 범위 적용 후 재고정. 범위 밖 모델 trimId 제외는 빌드가 오류로 보지 않음). 재빌드 시 사라진 id 가 있으면 빌드가 경고 — 견적이 끊기지 않도록 `aliases` 로 이관. 새 차량/연식 추가는 raw2 에 **뒤에 추가만** 하고 `node tools/raw-identity-append-check.js <brand>/raw2 <snapshot>` 로 확인.
- **전체 재빌드**: `node tools/vm-build-all.js` → 검증·레지스트리 검사·사이트 배포까지 한 번에. 추가가 정상이면 `--freeze-ids` 로 레지스트리 갱신.
- **견적 연결**: `node tools/quote-trim-match.js && node tools/quote-trim-apply.js && node tools/quote-trim-report.js` (반복 실행 안전).
- **최종 QA**: `node tools/qa-final-data.js`, `node tools/qa-final-ui.mjs pages|select|trims|quotes|perf`.

## 10. FINAL LOCK 선언

- 스키마 버전 `final-1.0`. 이후 STEP 4~9 는 이 구조로 데이터만 채운다.
- 현대 Pilot 전체(60 라인업·175 트림·251 제원·176 이미지)를 이 스키마로 변환해 `validate()` 에러 0 확인(`hyundai/out/hyundai-vehicle-master-final-draft.js`). STEP 4 에서 최신 공식 소스(국문 가격표 + 영문 가격표/카탈로그)로 재구축한다.
- 샘플: `pages/data/vehicle-master-sample-final.js` (쏘나타 디 엣지 2026 실데이터 발췌, 트림 3).
