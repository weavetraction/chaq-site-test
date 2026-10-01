# 차큐 API (백엔드)

사이트(정적 페이지)는 그대로 두고, 아래 두 가지를 서버가 맡습니다.

1. **견적·재고 데이터 관리**: 관리자 화면에서 엑셀을 올리면 재고특가·빠른인도·견적조회 데이터가 사이트에 바로 반영됩니다. 미리보기, 트림 연결, 반영, 되돌리기를 지원합니다.
2. **상담 문의 접수**: '이 조건 그대로 문의하기'를 누르면 차량·조건·월 납입금이 문의로 저장되고, 채널톡 상담창이 그 내용으로 열립니다. 관리자 화면에서 문의 목록·상태·메모를 관리합니다.

| 구성 | 사용 기술 |
|---|---|
| API 서버 | Node.js 22 · TypeScript · Express |
| DB | PostgreSQL 16 |
| 관리자 화면 | `/admin` (서버가 함께 제공) |
| 캐시·요청 제한 | Redis (서버 2대 이상일 때 공유) |
| 배포 | AWS 서울 — CloudFront → ALB → ECS Fargate · RDS · ElastiCache (`infra/`, AWS CDK) |

## 구조

```
server/
  src/index.ts              서버 시작 (시작할 때 DB 마이그레이션 자동 적용)
  src/routes/public.ts      사이트용: GET /api/quotes.js · POST /api/inquiries · GET /api/health
  src/routes/admin.ts       관리자용: 로그인 · 엑셀 받기/올리기 · 미리보기 · 트림 연결 · 반영 · 문의 관리
  src/lib/quotes-store.ts   업로드 묶음(batch) · 자동 트림 연결 · 반영/되돌리기 · 공개 데이터 캐시
  src/lib/excel.ts          엑셀 양식 (견적데이터 시트 + 작성안내 시트)
  src/lib/vm.ts             차량 데이터(pages/data/vehicle-master.js) 읽기 · 트림 검색
  src/lib/inquiries.ts      문의 저장·조회 · 채널톡 첫 메시지 · 유입 경로(UTM·광고 클릭 ID)
  src/lib/conversions.ts    서버 전환(GA4 MP·메타 CAPI) · 새 문의 알림
  src/lib/limits.ts         요청 제한 (REDIS_URL 이 있으면 서버 간 공유)
  migrations/*.sql          DB 테이블 (서버 시작 시 자동 적용, 동시 시작해도 1대만)
  admin/                    관리자 화면 (HTML·JS·CSS)
```

**DB 테이블:**

- `admins`: 관리자 계정
- `quote_batches`: 엑셀 업로드 1회 단위 (미리보기 → 반영 / 폐기)
- `quote_rows`: 견적 레코드. 사이트 `window.CHAQ` 레코드와 같은 모양으로 저장합니다.
- `published_sets`: 구분별로 지금 사이트에 나가는 업로드
- `inquiries`: 상담 문의

## 사이트 연결 (`pages/data/api-config.js`)

```js
window.CHAQ_API = {
  base: "https://api.chaq.kr",        // 배포한 API 주소
  channelPluginKey: "채널톡 플러그인 키",
  channelButton: false                // 채널톡 기본 버튼 표시 여부
};
```

- **`base`를 비워 두면:** 지금처럼 사이트 파일(`data/quotes.js`)만 씁니다.
- **`base`를 채우면:** 메인·목록·상세·마이페이지·차량선택이 API의 최신 데이터를 읽습니다. API가 응답하지 않으면 자동으로 사이트 파일을 씁니다.
- **`channelPluginKey`가 있으면:** 상담 버튼이 채널톡으로 열립니다. 서버가 응답하지 않아도 상담창은 열리고, 문의 저장만 빠집니다. 키가 없으면 지금처럼 안내창이 뜹니다.

## 내 컴퓨터에서 실행

```bash
# PostgreSQL 준비 후 (또는 docker compose -f server/docker-compose.yml up --build)
cd server && npm install
export DATABASE_URL=postgres://chaq:chaq@localhost:5432/chaq
npm run migrate
npm run seed                                      # 사이트의 현재 견적 데이터를 DB 로 옮기고 반영
npm run create-admin -- admin@chaq.kr '비밀번호10자이상' 관리자
npm run dev                                       # http://localhost:8080/admin
API_BASE=http://localhost:8080 ADMIN_EMAIL=admin@chaq.kr ADMIN_PASSWORD='...' npm test   # 동작 점검
```

## 배포 (AWS)

인프라 코드: `infra/` (AWS CDK). 처음 준비부터 오픈까지의 순서: [`docs/launch-runbook.md`](../docs/launch-runbook.md).

```
사용자 ─ CloudFront(WAF·인증서) ─┬─ S3 : 사이트 (index.html · pages/…)
         chaq.kr                 └─ /api/* · /admin* ─ ALB(CloudFront 만 허용) ─ ECS Fargate API (2~10대)
                                                                                 ├─ RDS PostgreSQL (Multi-AZ)
                                                                                 └─ ElastiCache Redis
```

- **배포:** `main`에 push하면 GitHub Actions가 스테이징에 배포합니다(`.github/workflows/deploy.yml`).
  - 운영은 Actions → Deploy → env=prod로 실행하고 승인을 받습니다.
  - 이미지(커밋 태그)를 ECR에 올린 뒤 ECS 무중단 교체를 합니다. 새 버전이 뜨지 않으면 자동으로 롤백됩니다. 사이트는 S3에 올리고 CloudFront 캐시를 비웁니다.
- **1회성 명령(시드·관리자 생성):**
  - `infra/scripts/ecs-run.sh prod node dist/scripts/seed-from-site.js`
  - `infra/scripts/ecs-run.sh prod node dist/scripts/create-admin.js 이메일 비밀번호 이름`
- **비밀값:** Secrets Manager의 `chaq/<env>/app`에 입력한 뒤 ECS 서비스를 재배포합니다.
  - 입력할 값: `GA4_API_SECRET`, `META_CAPI_TOKEN`, `NOTIFY_WEBHOOK_URL`, `SENTRY_DSN`
  - `JWT_SECRET`은 자동으로 생성됩니다.
- **DB 변경 규칙:** 배포 중에는 이전 버전과 새 버전이 잠시 함께 돕니다. 그래서 마이그레이션은 '추가' 위주로 작성합니다. 열 삭제·이름 변경은 두 번에 나눠 배포합니다.

## 운영 흐름

- **견적 갱신:**
  1. 관리자 → 견적 데이터 → '현재 데이터 엑셀 받기'
  2. 금액 수정, 행 추가·삭제
  3. 엑셀 올리기 → 미리보기에서 신규·빠짐·금액 변경·미연결을 확인합니다.
  4. 미연결 행은 트림을 검색해서 지정합니다. '같은 차량 모두 적용'을 켜면 같은 차량에 한 번에 적용됩니다.
  5. '사이트 반영'을 누르면 1분 안에 사이트에 보입니다.
- **되돌리기:** 업로드 이력에서 '이 데이터로 되돌리기'를 누릅니다.
- **주행거리 1만 km:** 양식에 `월_1만_…` 열이 있습니다. 비워 두면 사이트에 '별도문의'로 나옵니다.
- **상담:**
  - 고객이 문의를 남기면 채널톡에 '차량 · 사양 · 조건 · 월 납입금 · 옵션 · 색상 (문의번호 #N)'이 첫 메시지로 들어옵니다.
  - 관리자 → 상담 문의에서 상태(신규·상담 중·계약·종료)와 메모를 관리합니다. CSV로 받을 수도 있습니다.

## 보안

- **관리자 로그인:** bcrypt로 비밀번호를 저장하고, 12시간짜리 httpOnly 쿠키를 씁니다. 로그인 시도 횟수를 제한합니다.
- **문의 접수:** IP당 분당 10회로 제한하고, 입력 형식을 검사합니다. 스팸 방지용 숨은 칸이 있습니다. IP는 원문 대신 해시로만 저장합니다.
- **CORS:** 문의 접수는 `SITE_ORIGINS`에 적힌 사이트에서만 받습니다. 견적 데이터 읽기는 공개입니다(사이트에 이미 공개되는 정보).
- **AWS:**
  - API 서버는 CloudFront를 거친 요청만 받습니다(보안그룹 + 비밀 헤더).
  - WAF가 다음을 막습니다: 악성 IP, 일반 공격 패턴, SQL 인젝션, IP당 과다 요청, 문의 도배.
  - `adminAllowCidrs`를 설정하면 관리자 화면은 사무실 IP에서만 열립니다.
