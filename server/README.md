# 차큐 API (백엔드)

사이트(정적 페이지)는 그대로 두고, 아래 두 가지를 서버가 맡습니다.

1. **견적·재고 데이터 관리**: 관리자 화면에서 엑셀을 올리면 재고특가·빠른인도·견적조회 데이터가 사이트에 바로 반영됩니다. 미리보기, 트림 연결, 반영, 되돌리기를 지원합니다.
2. **상담 문의 접수**: '이 조건 그대로 문의하기'를 누르면 차량·조건·월 납입금이 문의로 저장되고, 채널톡 상담창이 그 내용으로 열립니다. 관리자 화면에서 문의 목록·상태·메모를 관리합니다.

| 구성 | 사용 기술 |
|---|---|
| API 서버 | Node.js 22 · TypeScript · Express |
| DB | PostgreSQL 16 |
| 관리자 화면 | `/admin` (서버가 함께 제공) |
| 배포 | Docker (Railway·Render·AWS 등 어디든) |

## 구조

```
server/
  src/index.ts              서버 시작 (시작할 때 DB 마이그레이션 자동 적용)
  src/routes/public.ts      사이트용: GET /api/quotes.js · POST /api/inquiries · GET /api/health
  src/routes/admin.ts       관리자용: 로그인 · 엑셀 받기/올리기 · 미리보기 · 트림 연결 · 반영 · 문의 관리
  src/lib/quotes-store.ts   업로드 묶음(batch) · 자동 트림 연결 · 반영/되돌리기 · 공개 데이터 캐시
  src/lib/excel.ts          엑셀 양식 (견적데이터 시트 + 작성안내 시트)
  src/lib/vm.ts             차량 데이터(pages/data/vehicle-master.js) 읽기 · 트림 검색
  src/lib/inquiries.ts      문의 저장·조회 · 채널톡 첫 메시지
  migrations/001_init.sql   DB 테이블
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

## 배포 (권장: Railway)

1. **프로젝트 만들기:** railway.app에서 New Project → Deploy from GitHub repo로 이 저장소를 선택합니다.
2. **DB 추가:** 같은 프로젝트에 **PostgreSQL**을 추가합니다. `DATABASE_URL`이 자동으로 연결됩니다.
3. **서비스 설정:**
   - Settings → Build: Dockerfile 경로를 `server/Dockerfile`로, 빌드 위치를 저장소 루트로 지정합니다.
4. **환경변수 입력:** `.env.example`을 참고합니다.
   - `JWT_SECRET`: 32자 이상 임의 문자열
   - `SITE_ORIGINS`: 사이트 주소
   - `DATABASE_SSL`: Railway 내부 연결이면 비워 둡니다.
   - `NODE_ENV=production`
5. **첫 배포 뒤 한 번만 실행:** Railway의 서비스 Shell에서 아래 두 명령을 실행합니다.
   - `node dist/scripts/seed-from-site.js`
   - `node dist/scripts/create-admin.js 이메일 비밀번호 이름`
6. **도메인 연결:** 예: `api.chaq.kr` → Railway가 알려주는 주소로 CNAME을 연결합니다.
7. **사이트 연결:** `pages/data/api-config.js`의 `base`에 그 주소를 넣고 사이트를 다시 올립니다.

저장소에 push하면 자동으로 다시 배포됩니다. 차량 데이터를 다시 빌드해 올리면, 서버도 새 차량 데이터로 트림을 연결합니다.

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
