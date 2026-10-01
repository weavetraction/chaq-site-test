# 차큐 이벤트·전환 설계 (GTM · GA4 · 광고 매체)

**구성:** 사이트는 `pages/data/analytics.js`를 통해 `dataLayer`에 이벤트를 넣습니다. 태그는 GTM 컨테이너 하나에서 관리합니다.

- **GTM 연결:** `pages/data/api-config.js`의 `gtmId`에 컨테이너 ID를 넣으면 GTM이 불러와집니다.
- **서버 전환:** 문의, 상담 중(유효 리드), 계약을 API 서버가 직접 보냅니다(`server/src/lib/conversions.ts`).
  - GA4는 Measurement Protocol, 메타는 Conversions API를 씁니다.
  - 브라우저 이벤트와 같은 `event_id`(`chaq-{단계}-{문의번호}`)를 써서 중복을 제거합니다.

## 1. 사이트 이벤트 (dataLayer)

| 이벤트 | 언제 | 주요 파라미터 | GA4 | 광고 전환 |
|---|---|---|---|---|
| `view_item_list` | 메인·목록(재고특가·빠른인도·견적조회)·차량선택 진입 | item_list_name | 권장 이벤트 | — |
| `select_item` | 차량 카드 클릭 (목록·같은 조건 다른 차량) | item_list_name, items[item_id, item_name, price] | 권장 이벤트 | — |
| `select_vehicle_filter` | 차량 선택 팝업에서 브랜드·모델·등급 선택 | filter_type(brand/model/trim), filter_value | 맞춤 | — |
| `view_item` | 차량 상세 진입 | items[item_id, item_name, item_variant(등급), item_category(재고특가/빠른인도/견적조회), price(월 납입금)] | 권장 이벤트 | 메타 ViewContent · 네이버/카카오 상세 조회(리타게팅) |
| `change_condition` | 상세에서 상품·기간·초기비용·주행거리 변경 | condition_group, condition_value | 맞춤 | — |
| `select_trim` | 상세에서 등급 변경 | trim_name | 맞춤 | — |
| `view_options` | 옵션 선택/옵션 상세 열기 | item_name | 맞춤 | — |
| `view_same_stock` | '같은 차량 다른 재고' 열기 | item_name | 맞춤 | — |
| `begin_inquiry` | 상담 버튼 클릭 | inquiry_type(detail/guide), item_name | 맞춤 | 메타 Contact(선택) |
| `generate_lead` | 문의 저장 완료 (문의번호 발급) | lead_id, lead_event_id, item_name, item_variant, monthly | **키 이벤트(전환)** | 구글 Ads 전환 · 메타 Lead · 네이버 전환(신청) · 카카오 전환(신청) |

**`generate_lead`가 기준 전환입니다.** 버튼 클릭(`begin_inquiry`)이 아니라 서버에 문의가 저장된 뒤에 발생합니다.

## 2. 서버 전환 (상담 단계)

| 단계 | 시점 (관리자 문의 상태) | GA4 (MP) | 메타 (CAPI) | event_id |
|---|---|---|---|---|
| 문의 | 접수 즉시 | generate_lead | Lead | `chaq-lead-{id}` |
| 유효 리드 | 신규 → 상담 중 | qualify_lead | (없음) | `chaq-qualify-{id}` |
| 계약 | → 계약 | close_convert_lead | Purchase (`META_CONTRACT_EVENT`로 변경 가능) | `chaq-contract-{id}` |

**전송 결과:** 문의별 `conv_log`에 남습니다.

**구글 Ads 오프라인 전환(계약):**

1. 관리자 CSV의 `gclid`, 계약일을 Google Ads에 업로드합니다.
2. 또는 다음 단계에서 Google Ads API로 자동화합니다.

## 3. 유입 기록 (문의에 함께 저장)

- **저장 범위:**
  - 처음 유입(`first_touch`, 90일)과 마지막 유입(`last_touch`)
  - `_ga` 클라이언트 ID, `_fbp`, `_fbc`
- **수집 값:**
  - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
  - 구글: `gclid`, `gbraid`, `wbraid`
  - 메타: `fbclid`
  - 네이버 검색광고: `n_media`, `n_query`, `n_ad`, `n_keyword`
  - 카카오: `kclid`
- **UTM이 없을 때:** 리퍼러로 구분합니다.
  - organic: 네이버, 구글, 다음, 빙, 줌
  - social: 인스타그램, 페이스북, 카카오, 유튜브, 네이버 블로그·카페, 스레드, X
  - 그 외: referral
- **직접 방문·사이트 안 이동:** 유입을 덮어쓰지 않습니다.

### UTM 규칙 (광고 링크에 반드시)

| 매체 | utm_source | utm_medium | utm_campaign |
|---|---|---|---|
| 네이버 검색광고 | naver | cpc | 캠페인명_영문 (예: brand_grandeur) |
| 네이버 GFA | naver | display | |
| 구글 검색/PMax | google | cpc / pmax | (자동 태깅 gclid 켜기) |
| 메타 | meta | paid_social | |
| 카카오모먼트 | kakao | display | |
| 카카오 채널 메시지 | kakao | crm | |
| 블로그·체험단 | blog | referral | 업체명 |

## 4. GTM 컨테이너 설정 체크리스트

1. **변수 (데이터 영역 변수):** lead_id, lead_event_id, item_name, item_variant, monthly, items, item_list_name
2. **GA4 설정:** 구성 태그(측정 ID)를 모든 페이지에 겁니다. 이벤트 태그는 위 이벤트명 그대로 전달합니다(전자상거래 items 포함).
3. **GA4 키 이벤트:** 관리 → 이벤트에서 `generate_lead`(필요 시 `qualify_lead`, `close_convert_lead`)를 키 이벤트로 지정합니다.
4. **Google Ads:**
   - 전환 링커(모든 페이지)
   - 전환 태그(트리거 `generate_lead`, 주문 ID = `lead_id`)
   - 리마케팅 태그
5. **메타 픽셀:**
   - PageView(모든 페이지), ViewContent(`view_item`)
   - Lead(`generate_lead`, eventID = `lead_event_id`) → 서버 CAPI와 중복 제거
6. **네이버 공통 스크립트(wcs):**
   - 모든 페이지에 공통 태그를 겁니다.
   - 전환은 `generate_lead`일 때 '신청' 전환으로 보냅니다.
7. **카카오 픽셀:** 모든 페이지에 PageView, `view_item`에 ViewContent, `generate_lead`에 Participation(신청)을 겁니다.
8. **동의:** 개인정보처리방침에 위 도구(GA·구글 광고·메타·네이버·카카오)와 수집 항목을 적습니다.
