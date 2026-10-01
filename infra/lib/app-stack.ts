// API 서버: ALB(HTTPS, CloudFront 에서만) → ECS Fargate (2대 이상, 자동 확장) · 로그 · 경보
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { EnvConfig } from "./config.js";
import { CoreStack, APP_SECRET_KEYS } from "./core-stack.js";

export interface AppProps extends StackProps { cfg: EnvConfig; core: CoreStack; imageTag: string }
export const ORIGIN_VERIFY_HEADER = "X-Origin-Verify";

export class AppStack extends Stack {
  readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AppProps) {
    super(scope, id, props);
    const { cfg, core, imageTag } = props;
    const prod = cfg.name === "prod";
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", { hostedZoneId: cfg.hostedZoneId, zoneName: cfg.zoneName });

    // ---- ECS
    const cluster = new ecs.Cluster(this, "Cluster", { clusterName: `chaq-${cfg.name}`, vpc: core.vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });
    const logGroup = new logs.LogGroup(this, "ApiLogs", { logGroupName: `/chaq/${cfg.name}/api`, retention: cfg.logRetentionDays as logs.RetentionDays, removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY });
    const task = new ecs.FargateTaskDefinition(this, "ApiTask", {
      family: `chaq-${cfg.name}-api`, cpu: cfg.apiCpu, memoryLimitMiB: cfg.apiMemoryMiB,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    const siteOrigins = cfg.siteDomains.map((d) => `https://${d}`).join(",");
    task.addContainer("api", {
      containerName: "api",
      image: ecs.ContainerImage.fromEcrRepository(core.repo, imageTag),
      portMappings: [{ containerPort: 8080 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "api" }),
      stopTimeout: Duration.seconds(20),
      environment: {
        NODE_ENV: "production", APP_ENV: cfg.name, PORT: "8080",
        SITE_ORIGINS: siteOrigins, ADMIN_URL: `https://${cfg.siteDomains[0]}/admin/`,
        DATABASE_SSL: "true", DB_POOL_MAX: "10", AUTO_MIGRATE: "true",
        TRUST_PROXY: "2",                                    // CloudFront → ALB
        REDIS_URL: core.redisUrl,
        GA4_MEASUREMENT_ID: cfg.ga4MeasurementId, META_PIXEL_ID: cfg.metaPixelId,
        LOG_LEVEL: "info", IMAGE_TAG: imageTag,
      },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(core.dbSecret, "host"),
        DB_PORT: ecs.Secret.fromSecretsManager(core.dbSecret, "port"),
        DB_USER: ecs.Secret.fromSecretsManager(core.dbSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(core.dbSecret, "password"),
        DB_NAME: ecs.Secret.fromSecretsManager(core.dbSecret, "dbname"),
        ...Object.fromEntries(APP_SECRET_KEYS.map((k) => [k, ecs.Secret.fromSecretsManager(core.appSecret, k)])),
      },
    });

    this.service = new ecs.FargateService(this, "ApiService", {
      serviceName: `chaq-${cfg.name}-api`, cluster, taskDefinition: task,
      desiredCount: cfg.apiMinTasks, minHealthyPercent: 100, maxHealthyPercent: 200,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, securityGroups: [core.appSg], assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },     // 새 버전이 안 뜨면 자동으로 이전 버전 유지
      enableExecuteCommand: true, healthCheckGracePeriod: Duration.seconds(60),
    });

    // ---- ALB (HTTPS 만, CloudFront 헤더가 있는 요청만 전달)
    const albLogs = new s3.Bucket(this, "AlbLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(90) }], removalPolicy: RemovalPolicy.RETAIN,
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `chaq-${cfg.name}-api`, vpc: core.vpc, internetFacing: true, securityGroup: core.albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, idleTimeout: Duration.seconds(60), dropInvalidHeaderFields: true,
    });
    alb.logAccessLogs(albLogs, "alb");
    const cert = new acm.Certificate(this, "OriginCert", { domainName: cfg.originDomain, validation: acm.CertificateValidation.fromDns(zone) });
    const listener = alb.addListener("Https", {
      port: 443, certificates: [cert], sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS, open: false,   // 인터넷 전체 허용 안 함 (보안그룹: CloudFront 만)
      defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: "text/plain", messageBody: "forbidden" }),
    });
    const tg = new elbv2.ApplicationTargetGroup(this, "ApiTargets", {
      vpc: core.vpc, port: 8080, protocol: elbv2.ApplicationProtocol.HTTP, targetType: elbv2.TargetType.IP,
      targets: [this.service], deregistrationDelay: Duration.seconds(20),
      healthCheck: { path: "/api/health", healthyHttpCodes: "200", interval: Duration.seconds(15), timeout: Duration.seconds(5), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
    });
    listener.addAction("FromCloudFront", {
      priority: 10,
      conditions: [elbv2.ListenerCondition.httpHeader(ORIGIN_VERIFY_HEADER, [core.originVerifySecret.secretValue.unsafeUnwrap()])],
      action: elbv2.ListenerAction.forward([tg]),
    });
    new route53.ARecord(this, "OriginRecord", { zone, recordName: cfg.originDomain, target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)) });

    // ---- 자동 확장: CPU 60% · 대당 요청 수 기준
    const scaling = this.service.autoScaleTaskCount({ minCapacity: cfg.apiMinTasks, maxCapacity: cfg.apiMaxTasks });
    scaling.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 60, scaleOutCooldown: Duration.seconds(60), scaleInCooldown: Duration.seconds(300) });
    scaling.scaleOnRequestCount("Requests", { requestsPerTarget: 1500, targetGroup: tg, scaleOutCooldown: Duration.seconds(60), scaleInCooldown: Duration.seconds(300) });

    // ---- 경보
    const notify = new cwActions.SnsAction(core.alarmTopic);
    const alarm = (aid: string, metric: cw.IMetric, threshold: number, desc: string, op = cw.ComparisonOperator.GREATER_THAN_THRESHOLD, periods = 3) => {
      const a = new cw.Alarm(this, aid, { metric, threshold, evaluationPeriods: periods, comparisonOperator: op, alarmDescription: desc, treatMissingData: cw.TreatMissingData.NOT_BREACHING });
      a.addAlarmAction(notify); a.addOkAction(notify);
    };
    const m = tg.metrics;
    alarm("Api5xx", m.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5), statistic: "Sum" }), 20, "API 5xx 5분 20건 초과", undefined, 1);
    alarm("ApiUnhealthy", m.unhealthyHostCount({ period: Duration.minutes(1), statistic: "Maximum" }), 1, "비정상 API 서버 있음", cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD, 3);
    alarm("ApiLatencyP95", m.targetResponseTime({ period: Duration.minutes(5), statistic: "p95" }), 1.5, "API 응답 p95 1.5초 초과");
    alarm("ApiCpu", this.service.metricCpuUtilization({ period: Duration.minutes(5) }), 85, "API CPU 85% 초과 (최대 대수 도달 가능)");
    alarm("ApiMemory", this.service.metricMemoryUtilization({ period: Duration.minutes(5) }), 85, "API 메모리 85% 초과");
    const errors = new logs.MetricFilter(this, "ErrorLogs", { logGroup, metricNamespace: "Chaq", metricName: `${cfg.name}-api-errors`, filterPattern: logs.FilterPattern.numberValue("$.level", ">=", 50), metricValue: "1" });
    alarm("ApiErrorLogs", errors.metric({ period: Duration.minutes(5), statistic: "Sum" }), 20, "API 오류 로그 5분 20건 초과", undefined, 1);

    // ---- 대시보드
    new cw.Dashboard(this, "Dashboard", {
      dashboardName: `chaq-${cfg.name}`,
      widgets: [[
        new cw.GraphWidget({ title: "요청 수 / 5xx", left: [m.requestCount({ statistic: "Sum" })], right: [m.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { statistic: "Sum" })] }),
        new cw.GraphWidget({ title: "응답 시간 p50/p95", left: [m.targetResponseTime({ statistic: "p50" }), m.targetResponseTime({ statistic: "p95" })] }),
        new cw.GraphWidget({ title: "API CPU·메모리", left: [this.service.metricCpuUtilization(), this.service.metricMemoryUtilization()] }),
        new cw.GraphWidget({ title: "DB CPU·연결", left: [core.db.metricCPUUtilization()], right: [core.db.metricDatabaseConnections()] }),
      ]],
    });

    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: this.service.serviceName });
    new CfnOutput(this, "TaskFamily", { value: task.family });
    new CfnOutput(this, "AppSubnets", { value: core.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.join(",") });
    new CfnOutput(this, "AppSecurityGroup", { value: core.appSg.securityGroupId });
  }
}
