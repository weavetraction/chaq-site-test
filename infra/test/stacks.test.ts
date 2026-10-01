// 인프라 규칙 점검: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { ENVS } from "../lib/config.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { CoreStack } from "../lib/core-stack.js";
import { AppStack } from "../lib/app-stack.js";
import { CdnStack } from "../lib/cdn-stack.js";
import { CicdStack } from "../lib/cicd-stack.js";

function build(name: "prod" | "staging") {
  const app = new App({ context: { "@aws-cdk/core:defaultCrossStackReferences": "strong" } }), cfg = ENVS[name];
  const env = { account: "123456789012", region: cfg.region };
  const edge = new EdgeStack(app, "E", { cfg, env: { ...env, region: "us-east-1" }, crossRegionReferences: true });
  const core = new CoreStack(app, "C", { cfg, env });
  const api = new AppStack(app, "A", { cfg, core, imageTag: "abc123", env });
  const cdn = new CdnStack(app, "D", { cfg, core, certificate: edge.certificate, webAclArn: edge.webAclArn, env, crossRegionReferences: true });
  const cicd = new CicdStack(app, "P", { cfg, core, cdn, env });
  return { edge: Template.fromStack(edge), core: Template.fromStack(core), api: Template.fromStack(api), cdn: Template.fromStack(cdn), cicd: Template.fromStack(cicd) };
}

test("운영: DB Multi-AZ·암호화·삭제 보호, Redis 장애조치", () => {
  const t = build("prod");
  t.core.hasResourceProperties("AWS::RDS::DBInstance", { MultiAZ: true, StorageEncrypted: true, DeletionProtection: true, Engine: "postgres" });
  t.core.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", { AutomaticFailoverEnabled: true, TransitEncryptionEnabled: true, NumCacheClusters: 2 });
  t.core.resourceCountIs("AWS::EC2::NatGateway", 2);
});

test("ALB 는 CloudFront 에서만 (인터넷 전체 허용 없음 · 헤더 없으면 403)", () => {
  const t = build("prod");
  t.core.hasResourceProperties("AWS::EC2::SecurityGroupIngress", { SourcePrefixListId: Match.stringLikeRegexp("^pl-"), FromPort: 443 });
  const sgs = t.core.findResources("AWS::EC2::SecurityGroup");
  for (const sg of Object.values(sgs)) for (const r of (sg as any).Properties.SecurityGroupIngress || []) assert.notEqual(r.CidrIp, "0.0.0.0/0");
  t.api.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", { Port: 443, DefaultActions: [Match.objectLike({ Type: "fixed-response" })] });
  t.api.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", { Conditions: [Match.objectLike({ Field: "http-header" })] });
});

test("API: 최소 2대·자동 롤백·이미지 태그·비밀값 주입", () => {
  const t = build("prod");
  t.api.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 2, DeploymentConfiguration: Match.objectLike({ DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 100 }) });
  t.api.hasResourceProperties("AWS::ApplicationAutoScaling::ScalableTarget", { MinCapacity: 2, MaxCapacity: 10 });
  const td = Object.values(t.api.findResources("AWS::ECS::TaskDefinition"))[0] as any, c = td.Properties.ContainerDefinitions[0];
  assert.match(JSON.stringify(c.Image), /abc123/);
  for (const k of ["DB_PASSWORD", "JWT_SECRET", "META_CAPI_TOKEN"]) assert.ok(c.Secrets.some((s: any) => s.Name === k), k);
  assert.ok(!c.Environment.some((e: any) => /PASSWORD|SECRET|TOKEN/.test(e.Name)), "비밀값이 일반 환경변수에 없음");
});

test("CloudFront: 사이트 + /api·/admin → ALB, 견적 데이터만 캐시, WAF·인증서", () => {
  const t = build("prod");
  t.cdn.hasResourceProperties("AWS::CloudFront::Distribution", { DistributionConfig: Match.objectLike({
    Aliases: ["chaq.kr", "www.chaq.kr"], WebACLId: Match.anyValue(), ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: "TLSv1.2_2021" }),
    CacheBehaviors: [Match.objectLike({ PathPattern: "/api/quotes.*" }), Match.objectLike({ PathPattern: "/api/*" }), Match.objectLike({ PathPattern: "/admin*" })],
  }) });
  t.edge.hasResourceProperties("AWS::WAFv2::WebACL", { Scope: "CLOUDFRONT", Rules: Match.arrayWith([Match.objectLike({ Name: "RateLimitInquiry" })]) });
});

test("배포 역할: 해당 GitHub environment 만", () => {
  const t = build("prod");
  t.cicd.hasResourceProperties("AWS::IAM::Role", { AssumeRolePolicyDocument: Match.objectLike({ Statement: [Match.objectLike({ Condition: { StringEquals: Match.objectLike({ "token.actions.githubusercontent.com:sub": "repo:weavetraction/chaq-site-test:environment:prod" }) } })] }) });
});

test("스테이징: 단일 AZ DB·작은 사양", () => {
  const t = build("staging");
  t.core.hasResourceProperties("AWS::RDS::DBInstance", { MultiAZ: false, DBInstanceClass: "db.t4g.micro" });
  t.api.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 1 });
});
