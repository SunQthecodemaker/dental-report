#!/usr/bin/env bash
# 워커를 VPS(ssh 별칭 hermes) 에 배포 — PC 의 Git Bash 에서 실행.
#   bash worker/deploy/deploy-vps.sh
#
# 1. worker/ 코드 전송 (node_modules·.env·.codex-home 제외)
# 2. .env 를 이 PC 의 secrets 헬퍼 값으로 생성 (값은 화면·파일 로그에 안 남김, ssh stdin 으로만 전달)
#    (.codex-home 의 Codex 로그인은 전송 대상이 아니라 VPS 에 그대로 남는다)
# 3. npm install → systemd 유닛 설치 → 재시작
set -euo pipefail

HOST="${HOST:-hermes}"
DEST=/root/dental-worker
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="$USERPROFILE\\.claude\\setup\\credentials\\get-secret.cmd"
get() { cmd //c "$SECRET" "$1" | tr -d '\r\n'; }

echo "▶ 코드 전송 → $HOST:$DEST"
tar -C "$WORKER_DIR" --exclude=node_modules --exclude=.env --exclude=.codex-home \
    --exclude=.watchdog-last-alert -czf - . | ssh "$HOST" "mkdir -p $DEST && tar -xzf - -C $DEST"

echo "▶ .env 생성"
{
  echo "SUPABASE_URL=$(get supabase.projects.offapp.url)"
  echo "SUPABASE_SERVICE_ROLE_KEY=$(get supabase.projects.offapp.service_role_key)"
  echo "CLAUDE_CODE_OAUTH_TOKEN=$(get anthropic.claude_code.oauth_token_1y)"
  echo "DISCORD_ALERT_CHANNEL=1522490071217995847"   # #자동화작업
  echo "WORKER_ID=vps"
  echo "COMPOSE_MODEL=opus"
  echo "ANALYZE_MODEL=sonnet"
  echo "TASK_MODEL=sonnet"
} | ssh "$HOST" "umask 077 && cat > $DEST/.env"

echo "▶ 설치·재시작"
ssh "$HOST" "set -e
  cd $DEST && npm install --omit=dev --no-audit --no-fund --loglevel=error
  cp deploy/dental-worker.service deploy/dental-worker-watchdog.service deploy/dental-worker-watchdog.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now dental-worker-watchdog.timer >/dev/null
  systemctl enable dental-worker >/dev/null
  systemctl restart dental-worker
  sleep 4
  systemctl --no-pager --lines=8 status dental-worker | sed -n '1,4p;/\\[worker\\]/p'"
