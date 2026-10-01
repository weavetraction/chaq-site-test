#!/usr/bin/env node
// 차큐 AWS 인프라 — 사용: npx cdk deploy --all -c env=staging   (env: staging | prod)
//   API 이미지 태그: -c imageTag=<git sha>  (GitHub Actions 배포가 자동으로 넣음)
import { App, Tags } from "aws-cdk-lib";
import { ENVS, EnvName, tagsOf, id } from "../lib/config.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { CoreStack } from "../lib/core-stack.js";
import { AppStack } from "../lib/app-stack.js";
import { CdnStack } from "../lib/cdn-stack.js";
import { CicdStack, GitHubOidcStack } from "../lib/cicd-stack.js";

const app = new App();
const envName = (app.node.tryGetContext("env") || "staging") as EnvName;
const cfg = ENVS[envName];
if (!cfg) throw new Error(`알 수 없는 env: ${envName} (staging | prod)`);
const imageTag = app.node.tryGetContext("imageTag") || "bootstrap";

const seoul = { account: cfg.account, region: cfg.region };
const usEast1 = { account: cfg.account, region: "us-east-1" };

new GitHubOidcStack(app, "Chaq-GitHubOidc", { env: seoul, description: "계정당 1회: GitHub Actions OIDC 공급자" });

const edge = new EdgeStack(app, id(cfg, "Edge"), { cfg, env: usEast1, crossRegionReferences: true, description: "CloudFront 인증서·WAF (us-east-1)" });
const core = new CoreStack(app, id(cfg, "Core"), { cfg, env: seoul, description: "VPC·RDS·Redis·비밀값·ECR·알림" });
const api = new AppStack(app, id(cfg, "App"), { cfg, core, imageTag, env: seoul, description: "ALB·ECS Fargate API" });
const cdn = new CdnStack(app, id(cfg, "Cdn"), { cfg, core, certificate: edge.certificate, webAclArn: edge.webAclArn, env: seoul, crossRegionReferences: true, description: "S3·CloudFront 사이트 (+ /api → ALB)" });
new CicdStack(app, id(cfg, "Cicd"), { cfg, core, cdn, env: seoul, description: "GitHub Actions 배포 역할" });
void api;

for (const [k, v] of Object.entries(tagsOf(cfg))) Tags.of(app).add(k, v);
