// GitHub Actions 배포 권한 (OIDC — 저장소에 AWS 키를 두지 않음)
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import { EnvConfig } from "./config.js";
import { CoreStack } from "./core-stack.js";
import { CdnStack } from "./cdn-stack.js";

const GH = "token.actions.githubusercontent.com";

/** 계정당 1번: GitHub OIDC 공급자 */
export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    new iam.OpenIdConnectProvider(this, "GitHub", { url: `https://${GH}`, clientIds: ["sts.amazonaws.com"] });
  }
}

export interface CicdProps extends StackProps { cfg: EnvConfig; core: CoreStack; cdn: CdnStack }

export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: CicdProps) {
    super(scope, id, props);
    const { cfg, core, cdn } = props;
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GitHub", `arn:aws:iam::${this.account}:oidc-provider/${GH}`);

    // GitHub 의 해당 environment(staging/prod) 작업만 이 역할을 쓸 수 있음 — prod environment 에 '승인자'를 걸어 운영 배포 통제
    const role = new iam.Role(this, "DeployRole", {
      roleName: `chaq-${cfg.name}-github-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        // GitHub 신원 형식 2가지 모두 허용 (기본 'owner/repo', 고유 ID 포함 'owner@ID/repo@ID') — 해당 environment 만
        StringEquals: { [`${GH}:aud`]: "sts.amazonaws.com", [`${GH}:sub`]: [
          `repo:${cfg.githubRepo}:environment:${cfg.githubEnvironment}`,
          `repo:${cfg.githubRepo.split("/")[0]}@${cfg.githubIds.owner}/${cfg.githubRepo.split("/")[1]}@${cfg.githubIds.repo}:environment:${cfg.githubEnvironment}`,
        ] },
      }),
      description: `GitHub Actions deploy (${cfg.githubRepo} / ${cfg.githubEnvironment})`,
    });
    // 이미지 올리기
    core.repo.grantPullPush(role);
    // 사이트 올리기 · 캐시 비우기
    cdn.siteBucket.grantReadWrite(role); cdn.siteBucket.grantDelete(role);
    role.addToPolicy(new iam.PolicyStatement({ actions: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], resources: [`arn:aws:cloudfront::${this.account}:distribution/${cdn.distribution.distributionId}`] }));
    // API 배포 (cdk deploy App 스택) — CDK 부트스트랩 역할을 거쳐 CloudFormation 으로 반영
    role.addToPolicy(new iam.PolicyStatement({ actions: ["sts:AssumeRole"], resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-*`] }));
    // 배포 확인·1회성 작업(시드·관리자 생성)
    role.addToPolicy(new iam.PolicyStatement({ actions: ["ecs:DescribeServices", "ecs:DescribeTasks", "ecs:ListTasks", "ecs:RunTask", "ecs:DescribeTaskDefinition", "cloudformation:DescribeStacks"], resources: ["*"] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: ["*"], conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } } }));

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn, description: "GitHub environment 변수 AWS_DEPLOY_ROLE_ARN 에 입력" });
  }
}
