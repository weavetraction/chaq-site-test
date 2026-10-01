// 환경별 설정 — 운영(prod)·스테이징(staging)
// 값이 바뀌는 곳은 여기 한 군데. 계정 ID·호스팅 영역 ID 등 '사업자 준비 항목'은 docs/launch-runbook.md 참고
export type EnvName = "prod" | "staging";

export interface EnvConfig {
  name: EnvName;
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
  natGateways: number;             // 운영 2 (AZ 장애 대비), 스테이징 1
  // ---- DB (RDS PostgreSQL)
  dbInstanceClass: string;         // 예: t4g.medium · m7g.large
  dbMultiAz: boolean;
  dbAllocatedGb: number;
  dbMaxAllocatedGb: number;
  dbBackupDays: number;
  dbDeletionProtection: boolean;
  // ---- Redis (ElastiCache)
  redisNodeType: string;
  redisReplicas: number;           // 0 = 1대, 1 이상 = 자동 장애조치 (Multi-AZ)
  // ---- API (ECS Fargate)
  apiCpu: number;                  // 1024 = 1 vCPU
  apiMemoryMiB: number;
  apiMinTasks: number;
  apiMaxTasks: number;
  // ---- 운영
  logRetentionDays: number;
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
  account: process.env.CDK_DEFAULT_ACCOUNT || "111111111111",   // ← 운영 계정 ID 로 교체
  region: "ap-northeast-2",
  zoneName: "chaq.kr",
  hostedZoneId: "Z00000000000000000000",                          // ← Route 53 호스팅 영역 ID 로 교체
  githubRepo: "weavetraction/chaq-site-test",
  ga4MeasurementId: "",
  metaPixelId: "",
};

export const ENVS: Record<EnvName, EnvConfig> = {
  prod: {
    ...common,
    name: "prod",
    siteDomains: ["chaq.kr", "www.chaq.kr"],
    originDomain: "origin.chaq.kr",
    vpcCidr: "10.10.0.0/16", azs: ["ap-northeast-2a", "ap-northeast-2c"], natGateways: 2,
    dbInstanceClass: "t4g.medium", dbMultiAz: true, dbAllocatedGb: 50, dbMaxAllocatedGb: 500, dbBackupDays: 14, dbDeletionProtection: true,
    redisNodeType: "cache.t4g.small", redisReplicas: 1,
    apiCpu: 1024, apiMemoryMiB: 2048, apiMinTasks: 2, apiMaxTasks: 10,
    logRetentionDays: 90,
    alarmEmails: [],
    adminAllowCidrs: [],
    wafRateLimitPer5Min: 3000,
    githubEnvironment: "prod",
  },
  staging: {
    ...common,
    name: "staging",
    siteDomains: ["stg.chaq.kr"],
    originDomain: "origin-stg.chaq.kr",
    vpcCidr: "10.20.0.0/16", azs: ["ap-northeast-2a", "ap-northeast-2c"], natGateways: 1,
    dbInstanceClass: "t4g.micro", dbMultiAz: false, dbAllocatedGb: 20, dbMaxAllocatedGb: 100, dbBackupDays: 3, dbDeletionProtection: false,
    redisNodeType: "cache.t4g.micro", redisReplicas: 0,
    apiCpu: 512, apiMemoryMiB: 1024, apiMinTasks: 1, apiMaxTasks: 2,
    logRetentionDays: 14,
    alarmEmails: [],
    adminAllowCidrs: [],
    wafRateLimitPer5Min: 3000,
    githubEnvironment: "staging",
  },
};

/** CloudFront 가 ALB 로 접속할 때 쓰는 AWS 관리 접두사 목록 (서울 리전 com.amazonaws.global.cloudfront.origin-facing)
 *  ALB 를 CloudFront 에서만 받도록 보안그룹에 사용 — 배포 전 확인: aws ec2 describe-managed-prefix-lists --region ap-northeast-2 */
export const CLOUDFRONT_PREFIX_LIST: Record<string, string> = { "ap-northeast-2": "pl-22a6434b" };

export const tagsOf = (c: EnvConfig) => ({ Project: "chaq", Env: c.name, ManagedBy: "cdk" });
export const id = (c: EnvConfig, s: string) => `Chaq-${c.name}-${s}`;
