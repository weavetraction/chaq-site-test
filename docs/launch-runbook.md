# 차큐 오픈 런북 (1단계: AWS 운영 환경 · 광고/분석 · 상담)

구성 요약은 다음 문서를 참고합니다.

- 인프라 구성: `server/README.md`
- 인프라 코드: `infra/`
- 이벤트 설계: `docs/analytics-events.md`

## 0. 사업자 준비 항목 (담당: 대표/운영)

| # | 항목 | 넣는 곳 | 비고 |
|---|---|---|---|
| 1 | **AWS 법인 계정** (루트 MFA, 결제 수단, IAM Identity Center 관리자) | `infra/lib/config.ts` `account` | 운영·스테이징 같은 계정 가능 (권장: AWS Organizations 로 분리) |
| 2 | **chaq.kr 도메인** 관리 권한 (가비아 등) | Route 53 호스팅 영역 생성 → 등록업체 네임서버를 Route 53 NS 4개로 변경 → `hostedZoneId` | 메일(MX) 레코드가 있으면 Route 53 에 먼저 옮겨 적기 |
| 3 | **장애 알림 메일** | `config.ts` `alarmEmails` | 배포 후 받은 확인 메일에서 Confirm |
| 4 | **관리자 접속 IP** (사무실 고정 IP, 선택) | `config.ts` `adminAllowCidrs` | 비우면 로그인만으로 접속 |
| 5 | **GA4 속성** (측정 ID `G-…`, Measurement Protocol API 비밀) | 측정 ID → `config.ts` `ga4MeasurementId` · GTM / API 비밀 → Secrets Manager `GA4_API_SECRET` | 데이터 보관 14개월로 변경, Google Ads 연결 |
| 6 | **GTM 컨테이너** (`GTM-…`) | GitHub environment 변수 `GTM_ID` | 태그 설정: `docs/analytics-events.md` §4 |
| 7 | **Google Ads** 계정 (전환 ID·라벨) | GTM | 자동 태깅(gclid) 켜기 |
| 8 | **Meta 비즈니스** (픽셀 ID, 전환 API 토큰, 도메인 인증) | 픽셀 ID → `config.ts` `metaPixelId` · GTM / 토큰 → Secrets Manager `META_CAPI_TOKEN` | 이벤트 관리자에서 chaq.kr 도메인 인증 |
| 9 | **네이버 검색광고·GFA** (공통 스크립트 계정 ID) | GTM | 전환 '신청' 등록 |
| 10 | **카카오모먼트** (픽셀 ID) | GTM | |
| 11 | **채널톡** 플러그인 키, 상담원 계정, 운영시간·자동응답 | GitHub environment 변수 `CHANNEL_PLUGIN_KEY` | 채널톡 → 마케팅 연동은 2단계 |
| 12 | **카카오 알림톡** 발신 프로필 (@차큐 채널 + 비즈니스 인증) · 템플릿 심사 | 2단계 (문의 접수 확인·상담 배정 알림) | 심사 2~5영업일 |
| 13 | **새 문의 알림 채널** (Slack Incoming Webhook 등) | Secrets Manager `NOTIFY_WEBHOOK_URL` | |
| 14 | **개인정보처리방침·이용약관** 개정 | `pages/agreement.html` 등 | 수집 항목(연락처·차량 조건·유입 경로·광고 식별자), 처리위탁(AWS·채널톡), 국외이전(Google·Meta), 쿠키·광고 식별자 이용 고지 |
| 15 | **법률 검토** | — | 리스 상품 중개 시 금융소비자보호법상 대출성 상품 판매대리·중개업 등록 필요 여부, 장기렌트 광고 표시 기준(월 납입금 산정 조건 표기), 표시광고법 |

> 14·15번은 법률 자문이 아닙니다. 오픈 전에 변호사나 노무·세무 전문가의 확인을 받으세요.

## 1. AWS 준비 (1회)

```bash
# 관리자 PC: Node 22, AWS CLI v2, 관리자 권한 로그인 (aws sso login 등)
cd infra && npm ci
# ① config.ts 의 account·hostedZoneId·alarmEmails 등 채우기 → PR 로 반영
# ② CDK 부트스트랩 (서울 + us-east-1: CloudFront 인증서·WAF 는 us-east-1)
npx cdk bootstrap aws://<계정ID>/ap-northeast-2 aws://<계정ID>/us-east-1
# ③ CloudFront 접두사 목록 ID 확인 (config.ts CLOUDFRONT_PREFIX_LIST 와 같아야 함)
aws ec2 describe-managed-prefix-lists --region ap-northeast-2 --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId'
```

## 2. 스테이징 구축 → 점검 → 운영 구축

같은 순서로 `-c env=staging`을 먼저 실행하고, 확인한 뒤 `-c env=prod`로 실행합니다.

```bash
npx cdk deploy Chaq-GitHubOidc                                   # 계정당 1번
npx cdk deploy Chaq-staging-Edge Chaq-staging-Core -c env=staging    # 인증서 DNS 검증 포함 ~20분 (RDS)
npx cdk deploy Chaq-staging-Cdn Chaq-staging-Cicd -c env=staging
```

### GitHub 설정

**경로:** 저장소 Settings → Environments에서 `staging`과 `prod`를 만듭니다.

- **`prod` 보호 규칙:** Required reviewers에 대표 등을 지정합니다.
- **두 환경의 Variables:**
  - `AWS_DEPLOY_ROLE_ARN`: `Chaq-<env>-Cicd` 출력값
  - `SITE_API_BASE`: `https://stg.chaq.kr`, 운영은 `https://chaq.kr`
  - `CHANNEL_PLUGIN_KEY`
  - `GTM_ID`

### 첫 API 배포

1. Actions → Deploy → Run workflow를 env=staging으로 실행합니다.
   - 이미지가 ECR에 올라가고 `Chaq-staging-App`이 생성됩니다.
   - 이때 ALB, ECS, 경보, 대시보드, `origin-stg.chaq.kr`이 만들어집니다.
2. 첫 데이터와 관리자 계정을 만듭니다.

```bash
infra/scripts/ecs-run.sh staging node dist/scripts/seed-from-site.js
infra/scripts/ecs-run.sh staging node dist/scripts/create-admin.js admin@chaq.kr '임시비밀번호' 관리자
```

실행 기록에 비밀번호가 남으니, 로그인을 확인한 뒤 같은 이메일로 한 번 더 실행해 새 비밀번호로 바꿉니다(같은 이메일이면 비밀번호만 갱신).

### 비밀값 입력

Secrets Manager의 `chaq/staging/app`에 다음 키를 입력합니다.

- `GA4_API_SECRET`
- `META_CAPI_TOKEN`
- `NOTIFY_WEBHOOK_URL`
- `SENTRY_DSN`

입력한 뒤 다음 명령으로 서비스를 다시 배포합니다.

```bash
aws ecs update-service --cluster chaq-staging --service chaq-staging-api --force-new-deployment
```

## 3. 스테이징 점검표

- [ ] `https://stg.chaq.kr`: 메인, 목록, 상세, 차량선택이 정상이고 견적이 API에서 옵니다(개발자도구 → `/api/quotes.js` 200 또는 304).
- [ ] `https://origin-stg.chaq.kr`에 직접 접속하면 403이 납니다(CloudFront만 허용).
- [ ] `/admin` 로그인 후 다음이 동작합니다: 엑셀 받기, 수정·올리기, 미리보기, 반영, 1분 안에 사이트 반영, 되돌리기.
- [ ] 상세 → '이 조건 그대로 문의하기'를 누르면 채널톡이 열리고, 관리자 문의 목록에 '유입'이 표시되며, 알림 채널에 새 문의가 옵니다.
- [ ] `?utm_source=naver&utm_medium=cpc&utm_campaign=test`로 접속한 뒤 문의합니다.
  - 관리자 CSV에 UTM이 들어 있어야 합니다.
  - GA4 DebugView에 `generate_lead`가 보여야 합니다.
  - 메타 이벤트 관리자에 Lead가 브라우저와 서버 양쪽에서 들어오고, 중복 제거되어야 합니다.
- [ ] 문의 상태를 '상담 중'과 '계약'으로 바꾸면 GA4에 `qualify_lead`와 `close_convert_lead`가 기록됩니다(DB `inquiries.conv_log`에 매체별 전송 결과가 기록됩니다).
- [ ] 정상 배포와 실패 배포를 확인합니다.
  - 정상: main에 push하면 무중단으로 교체됩니다.
  - 실패: 일부러 실패하는 이미지를 배포하면 자동으로 롤백되고 사이트는 유지됩니다.
- [ ] CloudWatch 대시보드 `chaq-staging`과 경보 메일 수신을 확인합니다.

## 4. 운영 오픈

1. 2~3번을 `prod`로 반복합니다(Actions → Deploy → env=prod → 승인).
2. **DNS 전환:** 등록업체 NS를 Route 53으로 바꾼 뒤 `chaq.kr`과 `www.chaq.kr` 인증서가 발급됐는지 확인합니다. 전파에는 최대 48시간이 걸립니다.
3. **GTM:** 컨테이너를 게시하고 미리보기 모드로 모든 태그를 확인합니다. 그 뒤 광고 매체별 전환을 '활성'으로 바꿉니다.
4. **광고 집행:** UTM 규칙(`docs/analytics-events.md` §3)에 따라 링크를 만들고 소액으로 테스트합니다. 1~2일 동안 전환 수집을 확인한 뒤 예산을 늘립니다.

## 5. 운영 메모

- **비용(대략, 서울, 트래픽 제외):** 정확한 금액은 AWS 요금 계산기로 확인하세요.

  | 환경 | 월 비용 | 주요 항목 |
  |---|---|---|
  | 운영 | US$450~600 | RDS Multi-AZ, NAT 2개, Fargate 2대, Redis 2대, ALB, WAF |
  | 스테이징 | 약 US$150 | |

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

## 6. 2단계 예정 (참고)

- 카카오 알림톡: 문의 접수 확인(고객), 상담 배정(담당자)
- 관리자 기능: 비밀번호 변경, 계정·권한, 상담 배정, 담당자별 통계
- Google Ads 오프라인 전환 자동 업로드(gclid, 계약)
- 회원과 마이페이지 실데이터
- 콘텐츠(FAQ·후기·이벤트) 관리
