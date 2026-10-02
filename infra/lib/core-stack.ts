// 서울 리전 기반: 네트워크 · DB(RDS PostgreSQL) · Redis · 비밀값 · 이미지 저장소(ECR) · 알림
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as budgets from "aws-cdk-lib/aws-budgets";
import { EnvConfig, CLOUDFRONT_PREFIX_LIST } from "./config.js";

export interface CoreProps extends StackProps { cfg: EnvConfig }

/** 앱 컨테이너가 받는 비밀값 키 (Secrets Manager chaq/{env}/app) — JWT_SECRET 은 자동 생성, 나머지는 콘솔에서 입력 */
export const APP_SECRET_KEYS = ["JWT_SECRET", "GA4_API_SECRET", "META_CAPI_TOKEN", "NOTIFY_WEBHOOK_URL", "SENTRY_DSN"] as const;

export class CoreStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly appSg: ec2.SecurityGroup;
  readonly db: rds.DatabaseInstance;
  readonly dbSecret: secrets.ISecret;
  readonly appSecret: secrets.Secret;
  readonly originVerifySecret: secrets.Secret;
  readonly redisUrl: string | undefined;
  /** API 서버 위치: NAT 가 없으면 공개 서브넷(공인 IP, 보안그룹으로 ALB 만 허용) */
  readonly appSubnets: ec2.SubnetSelection;
  readonly appPublicIp: boolean;
  readonly repo: ecr.Repository;
  readonly alarmTopic: sns.Topic;

  private readonly azs: string[];
  /** 가용 영역을 설정값으로 고정 (조회 없이 synth 가능, 배포마다 같은 AZ) */
  get availabilityZones(): string[] { return this.azs; }

  constructor(scope: Construct, id: string, props: CoreProps) {
    super(scope, id, props);
    const { cfg } = props;
    this.azs = cfg.azs;
    const prod = cfg.name === "prod";

    // ---- 네트워크: 공개(ALB·NAT) / 앱(ECS, 외부로만 나감) / DB(외부 연결 없음) × 2 AZ
    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr(cfg.vpcCidr), availabilityZones: cfg.azs, natGateways: cfg.natGateways,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        // NAT 가 없을 때도 같은 이름·크기로 만들어 둠 → 나중에 full 로 올려도 DB 서브넷 주소가 바뀌지 않음
        { name: "app", subnetType: cfg.natGateways > 0 ? ec2.SubnetType.PRIVATE_WITH_EGRESS : ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 22 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });
    this.appPublicIp = cfg.natGateways === 0;
    this.appSubnets = this.appPublicIp ? { subnetType: ec2.SubnetType.PUBLIC } : { subnetGroupName: "app" };
    if (cfg.tier === "full") this.vpc.addFlowLog("RejectFlowLog", { trafficType: ec2.FlowLogTrafficType.REJECT });

    // ---- 보안 그룹: 인터넷 → (CloudFront 만) → ALB → 앱 → DB·Redis
    this.albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc: this.vpc, description: "ALB: CloudFront origin-facing only", allowAllOutbound: true });
    this.albSg.addIngressRule(ec2.Peer.prefixList(CLOUDFRONT_PREFIX_LIST[cfg.region]), ec2.Port.tcp(443), "CloudFront");
    this.appSg = new ec2.SecurityGroup(this, "AppSg", { vpc: this.vpc, description: "ECS API tasks", allowAllOutbound: true });
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(8080), "ALB");
    const dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc: this.vpc, description: "RDS", allowAllOutbound: false });
    dbSg.addIngressRule(this.appSg, ec2.Port.tcp(5432), "API");
    const redisSg = new ec2.SecurityGroup(this, "RedisSg", { vpc: this.vpc, description: "Redis", allowAllOutbound: false });
    redisSg.addIngressRule(this.appSg, ec2.Port.tcp(6379), "API");

    // ---- 알림 (장애 메일)
    this.alarmTopic = new sns.Topic(this, "Alarms", { topicName: `chaq-${cfg.name}-alarms` });
    cfg.alarmEmails.forEach((e) => this.alarmTopic.addSubscription(new subs.EmailSubscription(e)));
    const alarm = (aid: string, metric: cw.IMetric, threshold: number, desc: string, op = cw.ComparisonOperator.GREATER_THAN_THRESHOLD, periods = 3) => {
      const a = new cw.Alarm(this, aid, { metric, threshold, evaluationPeriods: periods, comparisonOperator: op, alarmDescription: desc, treatMissingData: cw.TreatMissingData.NOT_BREACHING });
      a.addAlarmAction(new cwActions.SnsAction(this.alarmTopic)); a.addOkAction(new cwActions.SnsAction(this.alarmTopic));
    };

    // ---- DB: PostgreSQL 16 (운영 Multi-AZ · 암호화 · 자동 백업 · SSL 강제)
    const params = new rds.ParameterGroup(this, "DbParams", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      parameters: { "rds.force_ssl": "1", log_min_duration_statement: "1000", idle_in_transaction_session_timeout: "60000", "pg_stat_statements.track": "all" },
    });
    this.db = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: new ec2.InstanceType(cfg.dbInstanceClass),
      vpc: this.vpc, vpcSubnets: { subnetGroupName: "data" }, securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret("chaq", { secretName: `chaq/${cfg.name}/db` }),
      databaseName: "chaq", parameterGroup: params,
      multiAz: cfg.dbMultiAz, storageType: rds.StorageType.GP3, allocatedStorage: cfg.dbAllocatedGb, maxAllocatedStorage: cfg.dbMaxAllocatedGb > cfg.dbAllocatedGb ? cfg.dbMaxAllocatedGb : undefined, storageEncrypted: true,
      backupRetention: Duration.days(cfg.dbBackupDays), preferredBackupWindow: "18:00-19:00", preferredMaintenanceWindow: "sun:19:00-sun:20:00",   // UTC = 한국 새벽 3~5시
      deletionProtection: cfg.dbDeletionProtection, removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      monitoringInterval: cfg.freePlan ? undefined : Duration.seconds(60), enablePerformanceInsights: cfg.tier === "full", cloudwatchLogsExports: ["postgresql"],
      autoMinorVersionUpgrade: true, copyTagsToSnapshot: true,
    });
    this.dbSecret = this.db.secret!;
    alarm("DbCpu", this.db.metricCPUUtilization({ period: Duration.minutes(5) }), 80, "RDS CPU 80% 초과");
    alarm("DbStorage", this.db.metricFreeStorageSpace({ period: Duration.minutes(5) }), 5 * 1024 ** 3, "RDS 남은 저장공간 5GB 미만", cw.ComparisonOperator.LESS_THAN_THRESHOLD, 1);
    alarm("DbMemory", this.db.metricFreeableMemory({ period: Duration.minutes(5) }), 200 * 1024 ** 2, "RDS 여유 메모리 200MB 미만", cw.ComparisonOperator.LESS_THAN_THRESHOLD);
    alarm("DbConnections", this.db.metricDatabaseConnections({ period: Duration.minutes(5) }), cfg.tier === "full" ? 300 : 60, "RDS 연결 수 과다");

    // ---- Redis 7 (요청 제한 공유 · 이후 캐시/세션) — full 에서만, 운영은 복제본 + 자동 장애조치
    let redisAddress: string | undefined, redisUrl: string | undefined;
    if (cfg.redisEnabled) {
      const redisSubnets = new elasticache.CfnSubnetGroup(this, "RedisSubnets", {
        description: "chaq redis", subnetIds: this.vpc.selectSubnets({ subnetGroupName: "data" }).subnetIds,
      });
      const redis = new elasticache.CfnReplicationGroup(this, "Redis", {
        replicationGroupDescription: `chaq ${cfg.name}`, engine: "redis", engineVersion: "7.1", cacheNodeType: cfg.redisNodeType,
        numCacheClusters: 1 + cfg.redisReplicas, automaticFailoverEnabled: cfg.redisReplicas > 0, multiAzEnabled: cfg.redisReplicas > 0,
        cacheSubnetGroupName: redisSubnets.ref, securityGroupIds: [redisSg.securityGroupId],
        atRestEncryptionEnabled: true, transitEncryptionEnabled: true, transitEncryptionMode: "required",
        snapshotRetentionLimit: prod ? 3 : 0, preferredMaintenanceWindow: "sun:20:00-sun:21:00",
      });
      redisUrl = `rediss://${redis.attrPrimaryEndPointAddress}:${redis.attrPrimaryEndPointPort}`;
      const redisMetric = (m: string) => new cw.Metric({ namespace: "AWS/ElastiCache", metricName: m, dimensionsMap: { ReplicationGroupId: redis.ref }, period: Duration.minutes(5), statistic: "Maximum" });
      alarm("RedisCpu", redisMetric("EngineCPUUtilization"), 80, "Redis CPU 80% 초과");
      alarm("RedisMemory", redisMetric("DatabaseMemoryUsagePercentage"), 80, "Redis 메모리 80% 초과");
      redisAddress = redis.attrPrimaryEndPointAddress;
    }
    this.redisUrl = redisUrl;

    // ---- 비밀값
    this.appSecret = new secrets.Secret(this, "AppSecret", {
      secretName: `chaq/${cfg.name}/app`, description: "차큐 API 비밀값 — JWT_SECRET 외 키는 콘솔에서 입력 후 ECS 서비스 재배포",
      generateSecretString: {
        secretStringTemplate: JSON.stringify(Object.fromEntries(APP_SECRET_KEYS.filter((k) => k !== "JWT_SECRET").map((k) => [k, ""]))),
        generateStringKey: "JWT_SECRET", passwordLength: 48, excludePunctuation: true,
      },
    });
    // CloudFront → ALB 요청에만 붙는 헤더 값 (ALB 를 직접 호출하면 403)
    this.originVerifySecret = new secrets.Secret(this, "OriginVerify", {
      secretName: `chaq/${cfg.name}/origin-verify`, generateSecretString: { passwordLength: 40, excludePunctuation: true },
    });

    // ---- 컨테이너 이미지 저장소
    this.repo = new ecr.Repository(this, "ApiRepo", {
      repositoryName: `chaq-${cfg.name}-api`, imageScanOnPush: true, imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ description: "최근 30개만 보관", maxImageCount: 30 }],
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY, emptyOnDelete: !prod,
    });

    // ---- 월 예산 알림 (계정 전체 요금 기준)
    if (cfg.monthlyBudgetUsd > 0 && cfg.alarmEmails.length) {
      const subscribers = cfg.alarmEmails.map((address) => ({ subscriptionType: "EMAIL", address }));
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: { budgetName: `chaq-${cfg.name}-monthly`, budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: cfg.monthlyBudgetUsd, unit: "USD" } },
        notificationsWithSubscribers: [
          { notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 80, thresholdType: "PERCENTAGE" }, subscribers },
          { notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 100, thresholdType: "PERCENTAGE" }, subscribers },
        ],
      });
    }

    new CfnOutput(this, "DbEndpoint", { value: this.db.dbInstanceEndpointAddress });
    if (redisAddress) new CfnOutput(this, "RedisEndpoint", { value: redisAddress });
    new CfnOutput(this, "EcrRepo", { value: this.repo.repositoryUri });
    new CfnOutput(this, "AppSecretName", { value: this.appSecret.secretName });
  }
}
