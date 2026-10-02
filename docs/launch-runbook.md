# 차큐 오픈 런북 (1단계: AWS 운영 환경 · 광고/분석 · 상담)

구성 요약은 다음 문서를 참고합니다.

- 인프라 구성: `server/README.md`
- 인프라 코드: `infra/`
- 이벤트 설계: `docs/analytics-events.md`

## 0. 사업자 준비 항목 (담당: 대표/운영)

| # | 항목 | 넣는 곳 | 비고 |
|---|---|---|---|
| 1 | **AWS 계정** (가입 완료 ✔, 루트 MFA 켜기) | `infra/lib/config.ts` `account` | 계정 ID 는 CloudShell 1단계 출력으로 전달 |
| 2 | **chaq.co.kr 도메인** 관리 권한 (가비아 등) | Route 53 호스팅 영역 생성 → 등록업체 네임서버를 Route 53 NS 4개로 변경 → `hostedZoneId` | 메일(MX) 레코드가 있으면 Route 53 에 먼저 옮겨 적기 |
| 3 | **장애 알림 메일** | `config.ts` `alarmEmails` | 배포 후 받은 확인 메일에서 Confirm |
| 4 | **관리자 접속 IP** (사무실 고정 IP, 선택) | `config.ts` `adminAllowCidrs` | 비우면 로그인만으로 접속 |
| 5 | **GA4 속성** (측정 ID `G-…`, Measurement Protocol API 비밀) | 측정 ID → `config.ts` `ga4MeasurementId` · GTM / API 비밀 → Secrets Manager `GA4_API_SECRET` | 데이터 보관 14개월로 변경, Google Ads 연결 |
| 6 | **GTM 컨테이너** (`GTM-…`) | GitHub environment 변수 `GTM_ID` | 태그 설정: `docs/analytics-events.md` §4 |
| 7 | **Google Ads** 계정 (전환 ID·라벨) | GTM | 자동 태깅(gclid) 켜기 |
| 8 | **Meta 비즈니스** (픽셀 ID, 전환 API 토큰, 도메인 인증) | 픽셀 ID → `config.ts` `metaPixelId` · GTM / 토큰 → Secrets Manager `META_CAPI_TOKEN` | 이벤트 관리자에서 chaq.co.kr 도메인 인증 |
| 9 | **네이버 검색광고·GFA** (공통 스크립트 계정 ID) | GTM | 전환 '신청' 등록 |
| 10 | **카카오모먼트** (픽셀 ID) | GTM | |
| 11 | **채널톡** 플러그인 키, 상담원 계정, 운영시간·자동응답 | GitHub environment 변수 `CHANNEL_PLUGIN_KEY` | 채널톡 → 마케팅 연동은 2단계 |
| 12 | **카카오 알림톡** 발신 프로필 (@차큐 채널 + 비즈니스 인증) · 템플릿 심사 | 2단계 (문의 접수 확인·상담 배정 알림) | 심사 2~5영업일 |
| 13 | **새 문의 알림 채널** (Slack Incoming Webhook 등) | Secrets Manager `NOTIFY_WEBHOOK_URL` | |
| 14 | **개인정보처리방침·이용약관** 개정 | `pages/agreement.html` 등 | 수집 항목(연락처·차량 조건·유입 경로·광고 식별자), 처리위탁(AWS·채널톡), 국외이전(Google·Meta), 쿠키·광고 식별자 이용 고지 |
| 15 | **법률 검토** | — | 리스 상품 중개 시 금융소비자보호법상 대출성 상품 판매대리·중개업 등록 필요 여부, 장기렌트 광고 표시 기준(월 납입금 산정 조건 표기), 표시광고법 |

> 14·15번은 법률 자문이 아닙니다. 오픈 전에 변호사나 노무·세무 전문가의 확인을 받으세요.

## 1. 진행 방식: '라이트 운영'으로 시작

설정은 `infra/lib/config.ts`의 `PROD_TIER`로 정합니다. 처음에는 `"lite"`로 시작합니다.

| | lite (오픈 초기) | full (광고 본격 집행) |
|---|---|---|
| DB | t4g.small 1대, 백업 7일, 삭제 보호 | t4g.medium 이중화(Multi-AZ), 백업 14일 |
| API 서버 | 0.5 vCPU·1GB × 1~4대 (자동 확장) | 1 vCPU·2GB × 2~10대 |
| NAT·Redis | 없음 (서버는 공개 서브넷, 보안그룹으로 ALB만 허용) | NAT 2개, Redis 2대 |
| 월 비용(트래픽 제외) | 약 US$110~130 (15~18만 원) | 약 US$470~520 |

- **같은 점:** CloudFront, WAF, 인증서, 무중단 배포, 자동 롤백, 경보, 월 예산 알림은 둘 다 들어 있습니다.
- **full로 올리기:** `PROD_TIER = "full"`로 바꾸고 배포하면 됩니다. DB 서브넷 주소는 그대로이고 사양만 바뀝니다. DB 사양을 바꿀 때 몇 분간 재시작될 수 있으니 새벽에 진행합니다.
- **스테이징:** 상시 운영하지 않습니다. 큰 변경을 시험할 때만 만들고(`ENV_NAME=staging`) 쓰고 나면 지웁니다(`npx cdk destroy`).

### AWS 무료 플랜 → 유료 플랜 전환 (오픈 전 필수)

지금은 무료 플랜 계정이라 `config.ts`의 `AWS_FREE_PLAN = true` 상태입니다. 이 동안 DB는 t4g.micro, 백업 1일로 운영합니다.

- **무료 플랜의 한계:** 6개월이 지나거나 무료 크레딧을 다 쓰면 계정이 정지되고 사이트가 멈춥니다. 정지 후 90일 안에 업그레이드하지 않으면 데이터가 삭제됩니다.
- **크레딧 확인:** 결제 및 비용 관리 → 크레딧에서 남은 금액과 만료일을 수시로 확인합니다.

**전환 순서**

1. AWS 콘솔 → 결제 및 비용 관리 → 플랜 업그레이드를 진행합니다. 남은 크레딧은 유지됩니다.
2. 개발 담당이 `AWS_FREE_PLAN = false`로 바꾸고 배포합니다(CloudShell 2단계 재실행 또는 GitHub 배포). DB가 몇 분 재시작되니 새벽에 진행합니다.

## 2. AWS 구축 — 브라우저의 AWS CloudShell에서 (설치 필요 없음)

**처음 할 일:** 루트 계정에 MFA를 켭니다.

**CloudShell 여는 법:** AWS 콘솔 오른쪽 위 리전을 '서울'로 바꾼 뒤, 상단의 `>_` 아이콘(CloudShell)을 누릅니다.

### 1단계: DNS 준비 (5분)

1. CloudShell에서 Actions → Upload file로 `cloudshell-1-dns.sh`를 올립니다.
2. `bash cloudshell-1-dns.sh`를 실행합니다.
3. 출력된 4줄(계정 ID, 호스팅 영역 ID, CloudFront 목록, 도메인)을 개발 담당에게 전달합니다. 개발 담당은 이 값을 `config.ts`에 반영합니다.
4. 도메인 구매처에서 네임서버를 출력된 4개로 바꿉니다. 반영에 보통 1시간 안팎, 길면 48시간이 걸립니다.

### 2단계: 인프라 생성 (40~60분, 대부분 기다리는 시간)

1. 계정 ID가 반영된 `chaq-infra.zip`과 `cloudshell-2-deploy.sh`를 CloudShell에 올립니다.
2. `bash cloudshell-2-deploy.sh`를 실행합니다.
3. 출력된 `AWS_DEPLOY_ROLE_ARN`을 GitHub 설정에 넣습니다(아래 3번).
4. 알림 메일함에서 Confirm 링크를 누릅니다.

## 3. GitHub 설정 (1회)

저장소 Settings에서 설정합니다.

- **Environments → `prod`:**
  - Required reviewers에 대표를 지정합니다(배포 승인).
  - Variables에 다음을 넣습니다.
    - `AWS_DEPLOY_ROLE_ARN`
    - `SITE_API_BASE` = `https://chaq.co.kr`
    - `CHANNEL_PLUGIN_KEY`
    - `GTM_ID`
- **Secrets and variables → Actions → Repository variables:** `AUTO_DEPLOY_ENV` = `prod`로 설정합니다. main에 올라가면 승인한 뒤 운영에 반영됩니다.

## 4. 첫 배포와 오픈

1. **API·사이트 첫 배포:** Actions → Deploy → Run workflow를 env=prod로 실행하고 승인합니다.
   - 이미지가 만들어지고 API 서버, ALB, 경보가 생깁니다. 사이트도 S3에 올라갑니다.
2. **첫 데이터와 관리자 계정:** CloudShell에서 실행합니다.

```bash
cd infra && bash scripts/ecs-run.sh prod node dist/scripts/seed-from-site.js
bash scripts/ecs-run.sh prod node dist/scripts/create-admin.js admin@chaq.co.kr '임시비밀번호' 관리자
```

   실행 기록에 비밀번호가 남으니, 로그인을 확인한 뒤 같은 이메일로 한 번 더 실행해 새 비밀번호로 바꿉니다(같은 이메일이면 비밀번호만 갱신).

3. **비밀값 입력:** Secrets Manager의 `chaq/prod/app`에 다음 키를 입력합니다.
   - `GA4_API_SECRET`
   - `META_CAPI_TOKEN`
   - `NOTIFY_WEBHOOK_URL`
   - `SENTRY_DSN`

   입력한 뒤 다음 명령을 실행합니다.

```bash
aws ecs update-service --cluster chaq-prod --service chaq-prod-api --force-new-deployment
```

4. **점검** (오픈 전, 사이트를 아직 광고하지 않은 상태에서):
   - [ ] `https://chaq.co.kr`에서 메인, 목록, 상세, 차량선택이 정상이고 `/api/quotes.js`가 200 또는 304로 응답합니다.
   - [ ] `https://origin.chaq.co.kr`에 직접 접속하면 403이 납니다(CloudFront만 허용).
   - [ ] `/admin`에서 다음이 동작합니다: 엑셀 받기, 올리기, 미리보기, 반영(1분 안), 되돌리기.
   - [ ] 상세에서 문의하면 채널톡이 열리고, 관리자 목록에 '유입'이 표시되며, 알림 채널에 새 문의가 옵니다.
   - [ ] `?utm_source=naver&utm_medium=cpc&utm_campaign=test`로 접속해 문의합니다.
     - 관리자 CSV에 UTM이 있어야 합니다.
     - GA4 DebugView에 `generate_lead`가 보여야 합니다.
     - 메타 이벤트 관리자에 Lead가 들어오고 중복 제거되어야 합니다.
   - [ ] 문의 상태를 '상담 중'과 '계약'으로 바꾸면 GA4에 `qualify_lead`와 `close_convert_lead`가 기록됩니다(DB `inquiries.conv_log`).
   - [ ] 일부러 실패하는 버전을 배포하면 자동으로 롤백되고 사이트는 유지됩니다.
   - [ ] **이용후기를 실제 고객 후기로 교체합니다(대표 결정).** 지금은 예시 글 5건이 들어 있습니다.
     - 바꿀 파일: `pages/data/reviews.js`, 메인 `index.html` 후기 영역
     - 필요한 것: 고객 동의, 이름 마스킹, 실제 출고 차량, 사진
   - [ ] 약관과 개인정보처리방침의 회사명·주소를 바로잡습니다. 지금 본문에는 '주식회사 차큐', 'chaq.app'으로 적혀 있는데, 위브트랙션과 chaq.co.kr로 고쳐야 합니다.
5. **광고 시작:**
   1. GTM 컨테이너를 게시하고 미리보기로 태그를 확인합니다.
   2. 매체별 전환을 활성으로 바꿉니다.
   3. UTM 규칙에 따라 링크를 만들어 소액으로 테스트합니다.
6. **full 전환 시점:** 다음 중 하나에 해당하면 `PROD_TIER = "full"`로 바꾸고 배포합니다.
   - 광고 예산을 본격적으로 늘릴 때
   - CPU 경보가 반복될 때
   - 하루 방문이 수천 명을 넘을 때

## 4-1. 실제 구축 기록 (2026-10-02)

- **구축 완료:** AWS 계정 713005939050(무료 플랜, `AWS_FREE_PLAN = true`)에 Edge, Core, Cdn, Cicd, App 스택을 만들었습니다.
  - 도메인 chaq.co.kr(Route 53 영역 Z0200270KYMUTU46N4DU)
  - 첫 데이터 넣기와 관리자 계정(freefun@freefuncom.kr) 생성 완료
  - `/api/health` 정상
- **겪은 문제와 해결:**
  - 무료 플랜은 DB 제한이 있어 t4g.micro, 백업 1일로 맞췄습니다.
  - 실패한 첫 시도에서 ECR과 비밀값이 남아 이름이 충돌했습니다. 남은 것을 지운 뒤 다시 실행했습니다.
  - GitHub OIDC 신원이 고유 ID가 포함된 형식(`owner@ID/repo@ID`)으로 와서, 신뢰 정책에서 두 형식을 모두 허용하도록 바꿨습니다.
- **CloudShell 사용 팁:** 20~30분 동안 입력이 없으면 연결이 끊깁니다. 오래 걸리는 실행 중에는 창을 가끔 클릭하세요. 비밀번호를 입력한 뒤에는 작업이 끝날 때까지 키보드를 누르지 마세요(입력한 글자가 화면에 남습니다).
- **서버 직접 접속:** origin 주소로 직접 접속하면 응답 없이 연결 자체가 차단됩니다. 정상입니다.

## 5. 운영 메모

- **비용(대략, 서울, 트래픽 제외):** 정확한 금액은 AWS 요금 계산기로 확인하세요. 월 예산 알림이 설정되어 있습니다(lite US$200, full US$700, 80% 예상 시와 100% 도달 시 메일).
  - **CloudFront 정액 요금제:** 콘솔에서 Pro(US$15)로 바꾸면 CDN, WAF, DNS 비용이 고정됩니다(요청 월 1천만 건까지).

  | 환경 | 월 비용 | 주요 항목 |
  |---|---|---|
  | 운영 lite | US$110~130 | RDS 1대, Fargate 1대, ALB, WAF, 공인 IP |
  | 운영 full | US$470~520 | RDS Multi-AZ, NAT 2개, Fargate 2대, Redis 2대, ALB, WAF |
  | 스테이징 | 켜 둔 동안만 (하루 약 US$3~4) | |

- **확장:**
  - 트래픽은 API 2~10대 자동 확장과 견적 데이터 엣지 캐시로 받습니다.
  - DB가 병목이 되면 `dbInstanceClass`를 올리거나 읽기 복제본을 추가합니다.
  - `apiMaxTasks`를 늘릴 때는 DB 연결 수(`DB_POOL_MAX` × 대수)를 확인합니다.
- **백업과 복구:**
  - RDS는 자동 백업 14일(시점 복구)이고, 삭제 보호가 켜져 있으며, 삭제할 때 스냅샷이 남습니다.
  - 사이트 S3는 버전 관리로 이전 배포본을 30일 보관합니다.
- **되돌리기:**
  - API: Actions → Deploy를 이전 커밋으로 다시 실행합니다(해당 이미지 태그가 재사용됩니다).
  - 견적 데이터: 관리자 → 업로드 이력에서 되돌립니다.
- **보안 점검:**
  - 비밀값은 Secrets Manager에만 둡니다. 저장소와 GitHub에는 AWS 키가 없습니다(OIDC).
  - 관리자 비밀번호는 10자 이상으로 합니다.
  - GuardDuty와 Security Hub를 켜는 것을 권장합니다.

## 6. 보안 — 백엔드 완료 시 진행 (대표 결정, 2026-10-02)

- **관리자 IP 제한:** 백엔드가 완료되면 사무실 고정 IP를 받아 `config.ts`의 `adminAllowCidrs`에 넣습니다.
- **유료 봇 차단:** 백엔드가 완료되면 도입합니다(AWS WAF Bot Control, 또는 CloudFront 정액 Business 요금제).
- **외부 서버 파일:** chaq.kr 서버의 파일은 불러오지 않습니다. 약관 페이지와 메인 배너는 자체 파일로 바꿨습니다.
- **상시 점검:** AWS 루트 계정 MFA, 루트 대신 관리자 계정 사용, GitHub 2단계 인증과 사용한 토큰 삭제, GTM 편집 권한 최소화.

## 7. 2단계 예정 (참고)

- 카카오 알림톡: 문의 접수 확인(고객), 상담 배정(담당자)
- 관리자 기능: 비밀번호 변경, 계정·권한, 상담 배정, 담당자별 통계
- Google Ads 오프라인 전환 자동 업로드(gclid, 계약)
- 회원과 마이페이지 실데이터
- 콘텐츠(FAQ·후기·이벤트) 관리
