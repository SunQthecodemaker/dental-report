# dental-report-worker — PC2 24/7 워커

모바일진단서(dental-report) 앱이 Supabase `ai_jobs` 큐에 INSERT 한 작업을 받아
Claude Agent SDK (Max 구독 OAuth 인증) 로 처리하는 백그라운드 프로세스.

> 도메인 로직 없음 — 순수 Claude 호출 프록시.
> 워커가 다운되면 dental-report 가 60초 후 Gemini 폴백 자동 호출.

---

## 1회 세팅 (PC2)

### 사전 조건
- PC2 에 Node.js ≥ 20 설치
- Claude Code CLI 설치 + Max 구독 로그인 완료
- (선택) `npm install -g pm2` — 24/7 가동·자동 재시작용

### 절차

```bash
# 1. PC2 에서 git pull (dental-report 레포 이미 클론되어 있다고 가정)
cd Z:/web/모바일진단서/dental-report
git pull

# 2. 워커 디렉토리로 이동
cd worker

# 3. 의존성 설치
npm install

# 4. Claude Max OAuth 토큰 발급 (한 번만)
claude setup-token
#   → ~/.claude/.credentials.json 에 저장됨
#   → Agent SDK 가 자동으로 읽음

# 5. .env 파일 만들기
cp .env.example .env
#   → .env 편집 (Windows 메모장 가능)
#   → SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 채워 넣기
#   → 값은 secrets 헬퍼로 받기:
#       Z:\web\.claude-setup\credentials\get-secret.cmd supabase.projects.offapp.url
#       Z:\web\.claude-setup\credentials\get-secret.cmd supabase.projects.offapp.service_role_key

# 6. 테스트 실행 (foreground)
node index.js
#   → "[worker] Realtime 구독 활성" 떠야 정상

# 7. 정상 동작 확인 후 pm2 로 등록 (24/7 가동 + 자동 재시작)
npm run pm2:start
pm2 save
pm2 startup
#   → 표시되는 명령 한 줄을 관리자 권한으로 실행 (윈도우 부팅 시 자동 시작)
```

---

## 운영

```bash
pm2 status              # 워커 상태
pm2 logs dental-worker  # 실시간 로그
pm2 restart dental-worker
pm2 stop dental-worker
```

대시보드에서 워커 상태 확인:

```sql
-- Supabase SQL Editor
select status, count(*) from ai_jobs
where created_at > now() - interval '1 hour'
group by status;

-- 최근 잡 상세
select id, type, status, worker_id,
       extract(epoch from completed_at - started_at) as duration_sec,
       error
from ai_jobs
order by created_at desc
limit 20;
```

---

## 비용 (2026-06-15 부터)

Claude Max x20 ($200 크레딧/월). 본 워커가 처리하는 작업:

| 작업 | 호출/월 추정 | 토큰/회 |
|---|---|---|
| compose (진단서 본문) | ~150 회 | ~7k |
| analyze_patterns (학습 분석) | ~4 회 | ~50k |

월 ~$25~30 상당. Max x20 크레딧 안에서 충분.

크레딧 소진 시 워커가 401 받음 → ai_jobs 가 error 상태 →
dental-report 가 자동으로 Gemini 폴백 (사용자 무감지).

---

## 트러블슈팅

### "Authentication failed"
→ `claude setup-token` 재실행. 토큰 만료 가능.

### Realtime 구독은 활성인데 잡 안 들어옴
→ Supabase dashboard → Database → Replication → `ai_jobs` 가 publication 에 포함되어 있는지 확인.

### 같은 잡이 여러 번 처리됨
→ 한 PC2 에서 워커 인스턴스 1개만 띄울 것. `pm2 list` 로 중복 확인.
   여러 PC2 로 분산하고 싶으면 `WORKER_ID` 다르게 — claim 로직이 atomic.

### 워커가 죽어있는데 잡이 계속 INSERT 됨
→ dental-report 가 60초 후 Gemini 폴백 자동 호출. 큐 잡은 timeout error 로 마킹됨.
   복구 시 워커 시작하면 적체 잡 청소 (recoverStuck + drainPending).
