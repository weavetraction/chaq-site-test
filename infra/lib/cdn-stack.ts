// 사이트 배포: S3(비공개) + CloudFront(OAC) · /api·/admin 은 같은 주소에서 ALB 로 (CORS 없음, 견적 데이터는 엣지 캐시)
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { EnvConfig } from "./config.js";
import { CoreStack } from "./core-stack.js";
import { ORIGIN_VERIFY_HEADER } from "./app-stack.js";

export interface CdnProps extends StackProps { cfg: EnvConfig; core: CoreStack; certificate: acm.ICertificate; webAclArn: string }

export class CdnStack extends Stack {
  readonly siteBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id, props);
    const { cfg, core } = props;
    const prod = cfg.name === "prod";
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", { hostedZoneId: cfg.hostedZoneId, zoneName: cfg.zoneName });

    this.siteBucket = new s3.Bucket(this, "Site", {
      bucketName: `chaq-${cfg.name}-site-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],          // 이전 배포본 30일 보관 (되돌리기용)
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY, autoDeleteObjects: !prod,
    });
    const logBucket = new s3.Bucket(this, "CdnLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED, blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,                      // CloudFront 표준 로그 요구사항
      lifecycleRules: [{ expiration: Duration.days(90) }], removalPolicy: RemovalPolicy.RETAIN,
    });

    // 대표 주소로 이동(www → chaq.kr) · 폴더 주소에 index.html 붙이기
    const edgeFn = new cloudfront.Function(this, "ViewerRequest", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var r = event.request, host = (r.headers.host && r.headers.host.value) || "";
  if (host && host !== ${JSON.stringify(cfg.siteDomains[0])}) {
    var qs = Object.keys(r.querystring).map(function (k) { var v = r.querystring[k]; return v.multiValue ? v.multiValue.map(function (m) { return k + "=" + m.value; }).join("&") : k + (v.value ? "=" + v.value : ""); }).join("&");
    return { statusCode: 301, statusDescription: "Moved", headers: { location: { value: "https://${cfg.siteDomains[0]}" + r.uri + (qs ? "?" + qs : "") } } };
  }
  if (r.uri.endsWith("/")) r.uri += "index.html";
  return r;
}`),
    });
    // 보안 헤더 (HSTS·nosniff·SAMEORIGIN·Referrer-Policy) — AWS 관리형 정책 (CloudFront 정액 요금제와 호환)
    const security = cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS;

    // API 원본 (ALB) — CloudFront 만 아는 헤더를 붙여 보냄
    const api = new origins.HttpOrigin(cfg.originDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY, originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
      customHeaders: { [ORIGIN_VERIFY_HEADER]: core.originVerifySecret.secretValue.unsafeUnwrap() },
      readTimeout: Duration.seconds(60), keepaliveTimeout: Duration.seconds(30),
    });
    // 견적 데이터(/api/quotes.*): 서버 Cache-Control(기본 60초)을 따라 엣지 캐시 — 트래픽이 몰려도 서버는 1분에 한 번 수준
    const quotesCache = new cloudfront.CachePolicy(this, "QuotesCache", {
      cachePolicyName: `chaq-${cfg.name}-quotes`, minTtl: Duration.seconds(0), defaultTtl: Duration.seconds(60), maxTtl: Duration.seconds(300),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(), headerBehavior: cloudfront.CacheHeaderBehavior.none(), cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true, enableAcceptEncodingBrotli: true,
    });
    const dynamic: cloudfront.BehaviorOptions = {
      origin: api, viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY, allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: security,
    };

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `chaq ${cfg.name}`, domainNames: cfg.siteDomains, certificate: props.certificate, webAclId: props.webAclArn,
      defaultRootObject: "index.html", httpVersion: cloudfront.HttpVersion.HTTP2_AND_3, enableIpv6: true,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021, priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      enableLogging: true, logBucket, logFilePrefix: "cdn/",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: security,
        functionAssociations: [{ function: edgeFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "/api/quotes.*": { ...dynamic, allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD, cachePolicy: quotesCache, originRequestPolicy: undefined, compress: true },
        "/api/*": dynamic,
        "/admin*": dynamic,
      },
    });

    for (const d of cfg.siteDomains) {
      const t = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));
      const rn = d === cfg.zoneName ? undefined : d;
      new route53.ARecord(this, `A-${d}`, { zone, recordName: rn, target: t });
      new route53.AaaaRecord(this, `AAAA-${d}`, { zone, recordName: rn, target: t });
    }

    new CfnOutput(this, "SiteBucket", { value: this.siteBucket.bucketName });
    new CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "SiteUrl", { value: `https://${cfg.siteDomains[0]}` });
  }
}
