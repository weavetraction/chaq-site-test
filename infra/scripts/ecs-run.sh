#!/usr/bin/env bash
# 운영/스테이징 API 이미지로 1회성 명령 실행 (ECS RunTask) — 결과는 CloudWatch 로그 /chaq/<env>/api
#   infra/scripts/ecs-run.sh prod node dist/scripts/seed-from-site.js
#   infra/scripts/ecs-run.sh prod node dist/scripts/create-admin.js admin@chaq.co.kr '비밀번호' 관리자
set -euo pipefail
ENV="${1:?env (staging|prod)}"; shift
REGION="${AWS_REGION:-ap-northeast-2}"
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "Chaq-$ENV-App" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
CLUSTER=$(out ClusterName); FAMILY=$(out TaskFamily); SUBNETS=$(out AppSubnets); SG=$(out AppSecurityGroup); PUBIP=$(out AssignPublicIp)
CMD=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "$@")
TASK=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --task-definition "$FAMILY" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=${PUBIP:-DISABLED}}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"api\",\"command\":${CMD}}]}" --query 'tasks[0].taskArn' --output text)
echo "started $TASK"
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK"
CODE=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
echo "exit code: $CODE  (로그: CloudWatch /chaq/$ENV/api)"; [ "$CODE" = "0" ]
