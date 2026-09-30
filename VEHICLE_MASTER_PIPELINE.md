# 차큐 Vehicle Master — 데이터 파이프라인 운영 가이드

## 폴더
| 경로 | 내용 |
|---|---|
| `hyundai/` | 현대 전용 빌더(`build-final.js`, `verify-images.js`), raw/raw2, 이미지 후보 |
| `kia/ genesis/ kgm/ renault/ chevrolet/ gmc/` | 국산 브랜드: `SOURCE_CATALOG.*`, `raw2/*.json`, `brand-config.json`, `images-candidates.json`, `api-responses/`, `out/` |
| `import/<brand>/` | 수입 브랜드(같은 구조) |
| `tools/` | 범용 빌더·검증·병합·전체 빌드·Helper 테스트·추출 프롬프트·Commons 그룹 정의·trimId 레지스트리 |
| `merged/` | 통합 결과 `vehicle-master.js/.json`, `helper-test-report.json` |
| `chaq-doubleclick/` | 사이트(배포본 `pages/data/vehicle-master.js`) |

## 명령
```
node tools/vm-build-all.js               # 전체 재빌드 → 검증 → trimId 대조 → 배포
node tools/vm-build-all.js --freeze-ids  # 현재 trimId 를 기준 id 로 동결(최초 1회·의도적 변경 후)
node tools/vm-build-brand.js <dir>/brand-config.json   # 브랜드 1개만 빌드
node tools/vm-verify-images.js <dir> --apply           # 브랜드 1개 이미지 판정
node tools/vm-helper-test.js             # Helper 전 함수 전수 테스트
node chaq-doubleclick/tools/vm-validate.js merged/vehicle-master.js
```

## 새 모델/연식 반영
1. 공식 가격표/제원 URL 확인 → `SOURCE_CATALOG.md` 갱신
2. 추출: `tools/AGENT_PROMPT_TEMPLATE_GENERIC.md`(국산) 또는 `import/EXTRACTION_PROMPT.md`(수입) 규격으로 `raw2/<slug>.json` 작성 (판매가격 기록 금지, 공식 정보 없으면 null)
3. 새 모델이면 `brand-config.json > models` 에 id/nameKo/nameEn/body/family/code/gen/imgGroup 추가
4. `node tools/vm-build-all.js`

## brand-config 옵션
| 키 | 용도 |
|---|---|
| `models.<slug>.mergeInto` | 다른 raw 파일을 같은 모델의 라인업으로 합침 (예: K8 택시 → K8) |
| `models.<slug>.powertrainSplit` | 가격표가 파워트레인을 "선택품목"으로 표기한 경우 별도 라인업 생성 (예: 카니발 하이브리드) |
| `models.<slug>.codeAlt` | 보조 세대코드 (이미지 판별용) |
| `fuelFromTrim` | 연료가 섞인 라인업을 트림명 규칙으로 연료별 분리 (예: 랜드로버 D/P/Pe) |
| `trimNameRewrite` | 트림 표시명 정리 규칙 (원문은 variantNote sourceName 에 보존) |
| `imageModelAliases` | 이미지 파일명에서 모델을 인식할 별칭 (예: 무쏘 스포츠 ← Rexton Sports) |

## 이미지
1. `tools/commons-groups-*.json` 그룹 정의 → 검색 도구 HTML 생성(사용자 PC 실행, 결과는 압축 JSON)
2. 결과 JSON → `tools/commons-search-*.json` → 후보 선정(그룹당 ≤3장, 세대/페이스리프트 근거, 불확실하면 matchNote 에 "미확인")
3. `node tools/apply-candidates-step6.js <tag>` (브랜드별 images-candidates·api-responses·별칭 반영) → 전체 빌드
4. 판정: VERIFIED = 모델+세대 일치(HIGH) + 상업 이용 가능 라이선스 + 작가 + NonFree/Restrictions 없음. 그 외 REVIEW_REQUIRED(화면 비노출)

## trimId 규칙
`<brand>-<model>-<genCode|gen>-<연식>-<연료>[-변형]--<트림 슬러그>[-배터리/구동/인승]` — 한글은 로마자+용어 사전. 견적 연결 기준이므로 `tools/trim-id-registry.json` 로 고정, 사라지면 배포 중단.

## STEP 8 — 견적(Quote) 연결
1. `node tools/quote-trim-match.js` → merged/quote-trim-match.json (레코드별 trimId·신뢰도·연식일치·사유·후보)
2. `node tools/quote-trim-apply.js` → pages/data/quotes.js 에 trimId · vehiclePrice(=base) · vmLink 추가 (기존 필드 불변, 반복 실행 안전)
3. `node tools/quote-trim-report.js` → merged/quote-trim-unmatched.csv, merged/quote-trim-review.csv
화면 규칙: 연식·등급표기·차량가·월납입금·장착옵션·색상 = 견적 우선 / VM 옵션·색상목록·기본품목·제원은 연식 일치 시만 (Helper quoteView).
