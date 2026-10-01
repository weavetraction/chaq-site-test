#!/usr/bin/env bash
# [1단계] AWS CloudShell(서울)에서 실행 — chaq.kr DNS 를 Route 53 으로 준비 (몇 번 실행해도 안전)
#   bash cloudshell-1-dns.sh            (다른 도메인이면: DOMAIN=example.kr bash cloudshell-1-dns.sh)
set -euo pipefail
DOMAIN="${DOMAIN:-chaq.kr}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN." --query "HostedZones[?Name=='$DOMAIN.'] | [0].Id" --output text | sed 's|/hostedzone/||')
if [ "$ZONE_ID" = "None" ] || [ -z "$ZONE_ID" ]; then
  ZONE_ID=$(aws route53 create-hosted-zone --name "$DOMAIN" --caller-reference "chaq-$(date +%s)" --query HostedZone.Id --output text | sed 's|/hostedzone/||')
  echo "호스팅 영역을 새로 만들었습니다."
fi
PL=$(aws ec2 describe-managed-prefix-lists --region ap-northeast-2 --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)
echo
echo "=============== 아래 4줄을 복사해서 전달해 주세요 ==============="
echo "AWS 계정 ID      : $ACCOUNT"
echo "호스팅 영역 ID   : $ZONE_ID"
echo "CloudFront 목록  : $PL"
echo "도메인           : $DOMAIN"
echo "================================================================"
echo
echo "▶ 도메인 구매처(가비아·카페24 등) 관리 화면 → '네임서버 변경' 에 아래 4개를 입력하세요:"
aws route53 get-hosted-zone --id "$ZONE_ID" --query 'DelegationSet.NameServers' --output text | tr '\t' '\n' | sed 's/^/   /'
echo
echo "※ 지금 이 도메인으로 메일(MX)이나 다른 서비스를 쓰고 있다면, 네임서버를 바꾸기 전에 알려 주세요 (레코드를 먼저 옮겨야 끊기지 않음)."
