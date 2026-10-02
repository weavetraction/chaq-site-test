// us-east-1 (CloudFront 전용 리소스): 사이트 인증서 · CloudFront WAF
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { EnvConfig } from "./config.js";

export interface EdgeProps extends StackProps { cfg: EnvConfig }

export class EdgeStack extends Stack {
  readonly certificate: acm.ICertificate;
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: EdgeProps) {
    super(scope, id, props);
    const { cfg } = props;
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", { hostedZoneId: cfg.hostedZoneId, zoneName: cfg.zoneName });

    this.certificate = new acm.Certificate(this, "SiteCert", {
      domainName: cfg.siteDomains[0],
      subjectAlternativeNames: cfg.siteDomains.slice(1),
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ---- WAF (CloudFront 앞단): AWS 관리 규칙 + IP 당 요청 상한 + 문의 접수 상한 + (선택) 관리자 IP 제한
    const managed = (name: string, priority: number, excluded: string[] = [], scopeDown?: wafv2.CfnWebACL.StatementProperty): wafv2.CfnWebACL.RuleProperty => ({
      name, priority, overrideAction: { none: {} },
      statement: { managedRuleGroupStatement: { vendorName: "AWS", name, ruleActionOverrides: excluded.map((n) => ({ name: n, actionToUse: { count: {} } })), ...(scopeDown ? { scopeDownStatement: scopeDown } : {}) } },
      visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: name },
    });
    const pathStarts = (p: string): wafv2.CfnWebACL.StatementProperty => ({
      byteMatchStatement: { fieldToMatch: { uriPath: {} }, positionalConstraint: "STARTS_WITH", searchString: p, textTransformations: [{ priority: 0, type: "LOWERCASE" }] },
    });
    const notAdminApi: wafv2.CfnWebACL.StatementProperty = { notStatement: { statement: pathStarts("/api/admin/") } };
    const rules: wafv2.CfnWebACL.RuleProperty[] = [
      managed("AWSManagedRulesAmazonIpReputationList", 10),
      // 관리자 엑셀 업로드(최대 20MB)가 본문 크기 규칙에 걸리지 않게 해당 규칙만 '기록'으로
      // 관리자 API(로그인 필요)는 본문 검사 제외 — 차량 데이터 설명·이미지 업로드가 오탐으로 막히지 않게
      managed("AWSManagedRulesCommonRuleSet", 20, ["SizeRestrictions_BODY", "CrossSiteScripting_BODY"], notAdminApi),
      managed("AWSManagedRulesKnownBadInputsRuleSet", 30),
      managed("AWSManagedRulesSQLiRuleSet", 40, [], notAdminApi),
      {
        name: "RateLimitPerIp", priority: 50, action: { block: {} },
        statement: { rateBasedStatement: { limit: cfg.wafRateLimitPer5Min, aggregateKeyType: "IP" } },
        visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: "RateLimitPerIp" },
      },
      {
        name: "RateLimitInquiry", priority: 60, action: { block: {} },
        statement: { rateBasedStatement: { limit: 100, aggregateKeyType: "IP", scopeDownStatement: pathStarts("/api/inquiries") } },
        visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: "RateLimitInquiry" },
      },
    ];
    if (cfg.adminAllowCidrs.length) {
      const v4 = cfg.adminAllowCidrs.filter((c) => !c.includes(":")), v6 = cfg.adminAllowCidrs.filter((c) => c.includes(":"));
      const sets = [
        v4.length && new wafv2.CfnIPSet(this, "AdminIpV4", { scope: "CLOUDFRONT", ipAddressVersion: "IPV4", addresses: v4 }),
        v6.length && new wafv2.CfnIPSet(this, "AdminIpV6", { scope: "CLOUDFRONT", ipAddressVersion: "IPV6", addresses: v6 }),
      ].filter(Boolean) as wafv2.CfnIPSet[];
      const inAllow: wafv2.CfnWebACL.StatementProperty = sets.length === 1
        ? { ipSetReferenceStatement: { arn: sets[0].attrArn } }
        : { orStatement: { statements: sets.map((s) => ({ ipSetReferenceStatement: { arn: s.attrArn } })) } };
      rules.push({
        name: "AdminIpAllowOnly", priority: 5, action: { block: {} },
        statement: { andStatement: { statements: [
          { orStatement: { statements: [pathStarts("/admin"), pathStarts("/api/admin")] } },
          { notStatement: { statement: inAllow } },
        ] } },
        visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: "AdminIpAllowOnly" },
      });
    }
    const acl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: `chaq-${cfg.name}-cloudfront`, scope: "CLOUDFRONT", defaultAction: { allow: {} }, rules,
      visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true, metricName: `chaq-${cfg.name}-cloudfront` },
    });
    this.webAclArn = acl.attrArn;
    new CfnOutput(this, "WebAclArn", { value: acl.attrArn });
  }
}
