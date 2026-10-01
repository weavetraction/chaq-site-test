// 환경별 설정 — 운영(prod)·스테이징(staging)
// 값이 바뀌는 곳은 여기 한 군데. 계정 ID·호스팅 영역 ID 등 '사업자 준비 항목'은 docs/launch-runbook.md 참고
export type EnvName = "prod" | "staging";
/** lite = 오픈 초기 (월 약 15~20만원): DB 단일 AZ, NAT·Redis 없음, API 1~4대
 *  full = 운영급 (월 약 70만원): DB 이중화, NAT 2, Redis 장애조치, API 2~10대
 *  광고 본격 집행 전에 PROD_TIER 를 "full" 로 바꾸고 배포하면 같은 코드로 올라감 (재개발 없음) */
export type Tier = "lite" | "full";
export const PROD_TIER = "lite" as Tier;

export interface EnvConfig {
  name: EnvName;
  tier: Tier;
  account: string;                 // AWS 계정 ID (12자리)
  region: string;                  // 서울
  // ---- 도메인
  zoneName: string;                // Route 53 호스팅 영역 (예: chaq.kr)
  hostedZoneId: string;            // Route 53 호스팅 영역 ID (예: Z0123456789ABCDEFG)
  siteDomains: string[];           // CloudFront 가 받는 주소 — 첫 번째가 대표 주소 (나머지는 대표 주소로 이동)
  originDomain: string;            // CloudFront → ALB 연결용 내부 주소 (사용자에게 노출 안 됨)
  // ---- 네트워크
  vpcCidr: string;
  azs: string[];                   // 가용 영역 (서울: ap-northeast-2a·2b·2c·2d)
  natGateways: number;             // 0 = NAT 없음 (API 서버를 공개 서브넷에 두고 보안그룹으로 ALB 만 허용), 2 = AZ 장애 대비
  // ---- DB (RDS PostgreSQL)
  dbInstanceClass: string;         // 예: t4g.medium · m7g.large
  dbMultiAz: boolean;
  dbAllocatedGb: number;
  dbMaxAllocatedGb: number;
  dbBackupDays: number;
  dbDeletionProtection: boolean;
  // ---- Redis (ElastiCache) — 끄면 요청 제한은 서버별 메모리 (서버 1~2대일 때 충분)
  redisEnabled: boolean;
  redisNodeType: string;
  redisReplicas: number;           // 0 = 1대, 1 이상 = 자동 장애조치 (Multi-AZ)
  // ---- API (ECS Fargate)
  apiCpu: number;                  // 1024 = 1 vCPU
  apiMemoryMiB: number;
  apiMinTasks: number;
  apiMaxTasks: number;
  // ---- 운영
  logRetentionDays: number;
  containerInsights: boolean;      // ECS 상세 지표 (추가 요금)
  monthlyBudgetUsd: number;        // 월 예산 — 80% 예상·100% 실제 도달 시 alarmEmails 로 메일 (0 = 끔)
  alarmEmails: string[];           // 장애 알림 받을 메일
  adminAllowCidrs: string[];       // 관리자(/admin, /api/admin) 접속 허용 IP — 비우면 IP 제한 없음 (로그인만)
  wafRateLimitPer5Min: number;     // IP 당 5분 요청 상한 (초과 시 차단)
  // ---- 분석·광고 (공개 ID — 비밀 키는 Secrets Manager)
  ga4MeasurementId: string;        // G-XXXXXXX
  metaPixelId: string;
  // ---- CI/CD
  githubRepo: string;              // owner/repo
  githubEnvironment: string;       // GitHub Actions environment 이름 (배포 승인·비밀값 분리)
}

const common = {
  account: "713005939050",                                       // weavetraction
  region: "ap-northeast-2",
  zoneName: "chaq.kr",
  hostedZoneId: "Z09447102TMOR5NL3KVBN",                          // chaq.kr (Route 53)
  githubRepo: "weavetraction/chaq-site-test",
  ga4MeasurementId: "",
  metaPixelId: "",
};

export const PROD_FULL: EnvConfig = {
  ...common,
  name: "prod", tier: "full",
  siteDomains: ["chaq.kr", "www.chaq.kr"],
  originDomain: "origin.chaq.kr",
  vpcCidr: "10.10.0.0/16", azs: ["ap-northeast-2a", "ap-northeast-2c"], natGateways: 2,
  dbInstanceClass: "t4g.medium", dbMultiAz: true, dbAllocatedGb: 50, dbMaxAllocatedGb: 500, dbBackupDays: 14, dbDeletionProtection: true,
  redisEnabled: true, redisNodeType: "cache.t4g.small", redisReplicas: 1,
  apiCpu: 1024, apiMemoryMiB: 2048, apiMinTasks: 2, apiMaxTasks: 10,
  logRetentionDays: 90, containerInsights: true, monthlyBudgetUsd: 700,
  alarmEmails: [],
  adminAllowCidrs: [],
  wafRateLimitPer5Min: 3000,
  githubEnvironment: "prod",
};

export const PROD_LITE: EnvConfig = {
  ...PROD_FULL,
  tier: "lite",
  natGateways: 0,
  dbInstanceClass: "t4g.small", dbMultiAz: false, dbAllocatedGb: 20, dbMaxAllocatedGb: 200, dbBackupDays: 7,
  redisEnabled: false,
  apiCpu: 512, apiMemoryMiB: 1024, apiMinTasks: 1, apiMaxTasks: 4,
  logRetentionDays: 30, containerInsights: false, monthlyBudgetUsd: 200,
};

export const ENVS: Record<EnvName, EnvConfig> = {
  prod: PROD_TIER === "full" ? PROD_FULL : PROD_LITE,
  // 스테이징: 필요할 때만 만들고(cdk deploy) 쓰고 나면 지움(cdk destroy) — 운영 DB 와 완전히 분리
  staging: {
    ...PROD_LITE,
    name: "staging",
    siteDomains: ["stg.chaq.kr"],
    originDomain: "origin-stg.chaq.kr",
    vpcCidr: "10.20.0.0/16",
    dbInstanceClass: "t4g.micro", dbAllocatedGb: 20, dbMaxAllocatedGb: 50, dbBackupDays: 1, dbDeletionProtection: false,
    apiMinTasks: 1, apiMaxTasks: 2,
    logRetentionDays: 14, monthlyBudgetUsd: 0,
    githubEnvironment: "staging",
  },
};

/** CloudFront 가 ALB 로 접속할 때 쓰는 AWS 관리 접두사 목록 (서울 리전 com.amazonaws.global.cloudfront.origin-facing)
 *  ALB 를 CloudFront 에서만 받도록 보안그룹에 사용 — 배포 전 확인: aws ec2 describe-managed-prefix-lists --region ap-northeast-2 */
export const CLOUDFRONT_PREFIX_LIST: Record<string, string> = { "ap-northeast-2": "pl-22a6434b" };

export const tagsOf = (c: EnvConfig) => ({ Project: "chaq", Env: c.name, ManagedBy: "cdk" });
export const id = (c: EnvConfig, s: string) => `Chaq-${c.name}-${s}`;
