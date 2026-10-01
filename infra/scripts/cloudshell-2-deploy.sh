#!/usr/bin/env bash
# [2단계] AWS CloudShell(서울)에서 실행 — 네임서버 변경이 반영된 뒤 (확인: dig +short NS chaq.kr)
#   업로드한 chaq-infra.zip 이 있는 곳에서:  bash cloudshell-2-deploy.sh
#   만드는 것: GitHub 배포 권한 · 인증서·WAF · VPC·DB·비밀값·이미지 저장소 · S3·CloudFront   (API 서버는 GitHub Actions 첫 배포 때)
set -euo pipefail
ENV_NAME="${ENV_NAME:-prod}"
[ -d infra ] || unzip -oq chaq-infra.zip
cd infra
npm ci --no-audit --no-fund
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_ACCOUNT="$ACCOUNT"
grep -q "\"$ACCOUNT\"" lib/config.ts || { echo "⚠ config.ts 의 계정 ID 가 이 계정($ACCOUNT)과 다릅니다 — 이 메시지를 전달해 주세요" >&2; exit 1; }
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name "chaq.kr." --query "HostedZones[?Name=='chaq.kr.'] | [0].Id" --output text | sed 's|/hostedzone/||')
grep -q "\"$ZONE\"" lib/config.ts || { echo "⚠ 호스팅 영역 ID 불일치: 실제 $ZONE — 이 메시지를 전달해 주세요" >&2; exit 1; }
NS=$(dig +short NS chaq.kr 2>/dev/null || true)
echo "$NS" | grep -q awsdns || { echo "⚠ 아직 네임서버가 Route 53 으로 바뀌지 않았습니다 (현재: ${NS:-없음}). 반영 후 다시 실행하세요." >&2; exit 1; }
npx cdk bootstrap "aws://$ACCOUNT/ap-northeast-2" "aws://$ACCOUNT/us-east-1"
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com" >/dev/null 2>&1 \
  || npx cdk deploy Chaq-GitHubOidc --require-approval never
# 인증서 발급은 DNS 검증이라 네임서버가 바뀌어 있어야 함 (10~30분), DB 생성 10~15분
npx cdk deploy "Chaq-$ENV_NAME-Edge" "Chaq-$ENV_NAME-Core" "Chaq-$ENV_NAME-Cdn" "Chaq-$ENV_NAME-Cicd" -c env="$ENV_NAME" --require-approval never
echo
echo "=============== 아래 값을 GitHub 설정에 넣거나 전달해 주세요 ==============="
aws cloudformation describe-stacks --stack-name "Chaq-$ENV_NAME-Cicd" --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" --output text | sed 's/^/AWS_DEPLOY_ROLE_ARN : /'
aws cloudformation describe-stacks --stack-name "Chaq-$ENV_NAME-Cdn" --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text | sed 's/^/사이트 주소          : /'
echo "==========================================================================="
echo "알림 메일함에서 'AWS Notification - Subscription Confirmation' 메일의 Confirm 링크를 눌러 주세요."
