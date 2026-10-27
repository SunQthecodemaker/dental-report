# dental-report-worker — VPS 상주 AI 워커

모바일진단서(dental-report) 앱이 Supabase `ai_jobs` 큐에 INSERT 한 작업을 받아
구독 CLI 로 처리하는 백그라운드 프로세스.

```
1순위  Claude Code CLI  (`claude -p`, Max 구독 1년 토큰)
2순위  Codex CLI        (`codex exec`, ChatGPT 구독 — 워커 전용 로그인)
최후   브라우저가 직접 Gemini (Edge Function `generate-text`, 유료 선불 크레딧)
```

> 도메인 로직 없음 — 순수 LLM 호출 프록시. 프롬프트는 전부 dental-report `src/lib/gemini.js`.

**왜 VPS 인가 (2026-10-27 이전)**: PC2 Windows + pm2 + Agent SDK 구조는 받은 잡의 26% 만 성공
(`0xC0000409` 크래시 66건), 10-08 부터는 아예 멈췄는데 Gemini 폴백이 가려 3주간 몰랐다.
→ 24시간 켜진 VPS 로 옮기고, Agent SDK 대신 공식 CLI 를 호출, 장애는 텔레그램으로 알린다.

---

## 배포 / 갱신 (PC 의 Git Bash 에서)

```bash
bash worker/deploy/deploy-vps.sh
```

- 코드 전송 → `/root/dental-worker` (ssh 별칭 `hermes`)
- `.env` 를 PC secrets 헬퍼 값으로 생성 (Supabase service role · Claude 1년 토큰 · 텔레그램)
- `npm install` → systemd 유닛 설치 → `dental-worker` 재시작
- 같은 명령을 다시 실행해도 안전

### Codex 로그인 (최초 1회, 사람이 필요)

헤르메스의 Codex 로그인과 토큰 갱신이 겹치지 않도록 **워커 전용 `CODEX_HOME`** 을 쓴다.

```bash
ssh hermes
cd /root/dental-worker
CODEX_HOME=/root/dental-worker/.codex-home ./node_modules/.bin/codex login --device-auth
# 표시된 링크·코드를 브라우저에서 입력 → systemctl restart dental-worker
```

로그인 파일이 없으면 워커는 Codex 단계를 건너뛴다 (시작 로그 `codex=off`).

---

## 운영

```bash
ssh hermes
systemctl status dental-worker            # 상태
journalctl -u dental-worker -f            # 실시간 로그 (✓ … via claude|codex)
systemctl restart dental-worker
systemctl list-timers dental-worker-watchdog.timer
```

### 알림 (텔레그램)

| 상황 | 누가 알림 |
|---|---|
| Claude 실패 → Codex 로 넘김 | 워커 (30분에 1번) |
| Claude·Codex 둘 다 실패 → 브라우저가 Gemini | 워커 (30분에 1번) |
| 워커 프로세스가 죽거나 멈춤 (3분 넘게 대기 잡) | `watchdog.js` — systemd 타이머 10분마다 (1시간에 1번) |

### 큐 상태 SQL

```sql
select status, worker_id, count(*) from ai_jobs
where created_at > now() - interval '1 day'
group by 1, 2;
```

---

## 동작 규칙

- **4분 넘은 pending 은 처리하지 않고 `expired` 로 닫는다** — 브라우저는 최대 3분 기다리고 Gemini 로 넘어가므로
  그 뒤에 처리해 봐야 아무도 안 받는다 (옛 PC2 는 며칠 묵은 잡을 몰아 처리해 한도만 썼다).
- 브라우저 대기 시간: 진단서 작성 3분, 지침 정리·톤 규칙·패턴 분석 3분, 태그 추천 90초, 지침 검수 60초.
- 워커 내부 제한: Claude 100초 → Codex 80초.
- 모델: `.env` 의 `COMPOSE_MODEL`·`ANALYZE_MODEL` (기본 `sonnet` = 최신 Sonnet). payload 에 `model` 이 있으면 그걸 우선.

## 트러블슈팅

### 로그에 `claude 오류: Failed to authenticate`
→ 1년 토큰 만료·폐기. PC 에서 `claude setup-token`(진짜 터미널 필요) → `set-secret.cmd anthropic.claude_code.oauth_token_1y` → 배포 스크립트 재실행.

### Realtime 구독은 활성인데 잡 안 들어옴
→ Supabase dashboard → Database → Replication → `ai_jobs` 가 publication 에 포함되어 있는지 확인.
   (들어오지 않아도 2분마다 drainPending 이 줍는다)
