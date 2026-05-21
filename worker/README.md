# dental-report-worker — PC2 24/7 워커

모바일진단서(dental-report) 앱이 Supabase `ai_jobs` 큐에 INSERT 한 작업을 받아
Claude Agent SDK (Max 구독 OAuth 인증) 로 처리하는 백그라운드 프로세스.

> 도메인 로직 없음 — 순수 Claude 호출 프록시.
> 워커가 다운되면 dental-report 가 60초 후 Gemini 폴백 자동 호출.

---

## 1회 세팅 (PC2)

### 사전 조건 (한 번만)
- PC2 에 **Node.js ≥ 20** 설치 (https://nodejs.org LTS)
- **Claude Code CLI** 설치 + Max 구독 로그인 완료
- 한 번만:  새 터미널에서 `claude setup-token` → 브라우저에서 Max 계정 로그인 → 토큰 자동 저장

### 자동 세팅 — 더블클릭 1회

탐색기에서:

> **`Z:\web\모바일진단서\dental-report\worker\setup-pc2.cmd`** 더블클릭

스크립트가 자동으로:
- git pull (최신 워커 코드)
- pm2 글로벌 설치 (없으면)
- `npm install`
- `.env` 생성 (Z:/web/.claude-setup/credentials 의 secrets 헬퍼로 자동 채움)
- `pm2 start` (또는 이미 가동 중이면 restart)
- `pm2 save`

성공하면 `pm2 status` 출력으로 가동 확인.

### 부팅 시 자동 시작 (선택, 1회만)

관리자 권한 PowerShell 에서:
```powershell
cd Z:\web\모바일진단서\dental-report\worker
pm2 startup
```
→ 출력되는 명령 한 줄을 그 창에서 실행 → 끝

### 같은 스크립트 다시 실행해도 안전

dental-report 코드 업데이트 후 그냥 `setup-pc2.cmd` 다시 더블클릭하면:
- git pull → 새 워커 코드 받음
- 의존성 변경 있으면 다시 install
- 이미 가동 중인 워커 자동 재시작 (--update-env)

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
