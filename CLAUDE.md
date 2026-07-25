# dental-report — 프라임S치과 모바일 진단서 앱

초진 상담용 **브로셔형 진단서**를 만드는 사내 웹앱. 원장·직원이 진료실 PC에서 환자를 등록하고,
진단·치료계획·상담 내용을 입력하면 AI가 환자용 진단서 본문을 작성한다.

- 배포: https://sunqthecodemaker.github.io/dental-report/ (`main` push → GitHub Actions 자동 배포)
- 저장소: `SunQthecodemaker/dental-report` (단일 `main` 브랜치)

---

## 명령어

```bash
npm run dev       # Vite 개발 서버 → http://localhost:5173/dental-report/
npm run build     # 프로덕션 빌드 → dist/
npm run preview   # 빌드 결과 미리보기
npm run lint      # ESLint
```

로컬 실행에는 저장소 루트에 `.env` 가 필요하다 (`.env.example` 참고, gitignore 됨).
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 두 개뿐. 배포는 이 파일이 아니라
저장소 **Secrets** 를 쓴다 (`.github/workflows/deploy.yml`).

---

## 아키텍처

### 프론트 (React 19 + Vite 8, 라우터 basename `/dental-report`)

| 경로 | 파일 | 역할 |
|---|---|---|
| `/` | [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx) | 환자 목록·검색·등록, 진행 단계 표시 |
| `/editor/:chartNumber` | [src/pages/Editor.jsx](src/pages/Editor.jsx) | **핵심 화면.** 5단계 위저드 |
| `/settings` | [src/pages/Settings.jsx](src/pages/Settings.jsx) | 폼 항목·라이브러리·AI 룰 관리 (최대 파일) |
| `/report/:reportId` | [src/pages/ReportView.jsx](src/pages/ReportView.jsx) | 환자에게 보여주는 최종 진단서 |

**Editor 5단계** ([Editor.jsx:26](src/pages/Editor.jsx#L26) `STEP_LABELS`):
1. 진단 & 치료 계획 — [ClinicalForm.jsx](src/components/ClinicalForm.jsx)
2. 상담 관리 — [StaffForm.jsx](src/components/StaffForm.jsx)
3. 초안 (AI 작성 결과 편집) — [ContentEditor.jsx](src/components/ContentEditor.jsx) / [BlockEditor.jsx](src/components/BlockEditor.jsx)
4. 케이스 · 어필포인트 — [CaseStrengthSelector.jsx](src/components/CaseStrengthSelector.jsx)
5. 진단서 디자이너 — [BrochurePreview.jsx](src/components/BrochurePreview.jsx)

단계 ↔ 진행상태 매핑은 [reports.js](src/lib/reports.js) 의 `STEP_TO_STAGE` / `PROGRESS_STAGES`.

### 백엔드 (Supabase — 프로젝트 `chnqtrmlglqdmzqwsazm`)

이 프로젝트의 DB 는 병원 내 **다른 사내앱들과 공유**한다 (직원 스케줄·복지 등 테이블이 같이 있음).
dental-report 가 쓰는 테이블만 건드릴 것:

| 테이블 | 용도 |
|---|---|
| `dental_reports` | 환자 1명 = 1행. 진단서 본문·사진·설정 전부 여기 JSON 컬럼에 |
| `clinic_settings` | **id 기반 key-value JSON 설정 저장소** (아래 참고) |
| `ai_jobs` | AI 작업 큐 (브라우저 INSERT → PC2 워커가 처리) |
| `charting_corrections`, `edit_learning_logs` | 학습용 수정 이력 |

`clinic_settings` 는 id 하나가 설정 묶음 하나다:
`diagnosis_form_config`, `treatment_plan_config`, `staff_form_config`,
`writing_guidelines`, `terminology`, `clinic_strengths`, `tone_rules_table`,
`ai_instructions`, `treatment_cases`, `strength_cards`.
DB row 가 없으면 코드의 `DEFAULT_*` 상수로 폴백한다 ([formConfig.js](src/lib/formConfig.js), [staffFormConfig.js](src/lib/staffFormConfig.js)).

### AI 파이프라인 — 이 앱에서 가장 중요한 구조

```
브라우저: ai_jobs INSERT (status=pending)
   ↓ Supabase Realtime
PC2 워커 (worker/): Claude Agent SDK, Max 구독 OAuth → status=done/error
   ↓ Realtime
브라우저: 결과 수신
   └─ 60초 타임아웃 또는 error → Gemini 폴백 (Edge Function `generate-text`)
```

- 큐 클라이언트: [src/lib/aiJobs.js](src/lib/aiJobs.js) — `runJobWithFallback(type, payload, {fallback})`
- 워커: [worker/index.js](worker/index.js) — pm2 로 PC2 에서 24/7. atomic claim, stuck 복구(5분), 2분마다 적체 청소
- 폴백: [src/lib/gemini.js](src/lib/gemini.js) → Supabase Edge Function `generate-text`

**중요 — 워커에는 도메인 로직이 없다.** 순수 Claude 호출 프록시일 뿐이고
(`payload = { systemPrompt, userMessage, expectJson, model }`),
**모든 시스템 프롬프트·병원 룰은 dental-report 프론트 코드(주로 `gemini.js`)에 있다.**
AI 출력 품질을 고치려면 워커가 아니라 `gemini.js` 의 프롬프트 빌더를 봐야 한다.

잡 타입: `compose`(진단서 본문), `analyze_patterns`(학습 분석), `image_caption`,
`suggest_tags`, `validate_guideline`, `cleanup_guidelines`.

---

## 도메인 규칙 — 실수하기 쉬운 것들

**차트번호 = 이름 + 생년월일 6자리** (예: `홍길동901030`). 동명이인은 뒤에 `A`~`Z` 접미사.
생성·중복확인은 [chartNumber.js](src/lib/chartNumber.js) 에만 있다. URL 파라미터로도 쓰인다.

**치식(FDI) 좌우는 "환자를 마주본 시점" 관례를 따른다.** `1x`=상악 우측, `2x`=상악 좌측,
`3x`=하악 좌측, `4x`=하악 우측 — 즉 사진에서 보이는 왼쪽이 환자의 **오른쪽**이다.
과거에 구내사진 좌우를 반대로 인식한 버그가 있었으니 사진·치식 관련 작업 시 주의.
변환은 [toothCode.js](src/lib/toothCode.js).

**치료계획 헤더는 `#` 대신 `[N]` 표기를 쓴다** — `#` 이 치식 기호라 AI 가 환각을 일으켰기 때문.

**유사 케이스는 구글시트가 단일 원본**이다 ([caseSheet.js](src/lib/caseSheet.js)).
홈페이지(치료 전·후 갤러리)와 이 앱이 같은 시트(`14C9bQr2...` 의 `케이스` 탭)를 읽는다.
케이스 추가·수정은 **시트에서** 한다.

사진 경로는 시트의 **H(원본폴더) + I(전후쌍수)** 로 조립한다 —
`{폴더}/before01, after01, before02 …` 규칙이고 양쪽이 같은 규칙을 쓰되 파일 위치만 다르다:

| | 파일 위치 | 형식 |
|---|---|---|
| 홈페이지 | 자기 서버 `before_after/cases/` (상대경로) | png 원본 |
| 진단서 앱 | Supabase Storage `library/cases/` | webp 변환본 |

앱이 홈페이지 사진을 직접 못 쓰는 이유: `primes.co.kr` 이 **HTTP 로만 열린다**
(HTTPS 는 도메인 전체가 NHN 호스팅 안내 페이지로 302). HTTPS 인 이 앱에서 http 이미지를
불러오면 브라우저가 mixed content 로 차단하므로, 같은 사진을 webp 로 줄여 Storage 에 복사해 뒀다.

**새 케이스를 추가할 때는 세 곳이 다 필요하다**: ① 시트에 행 추가(폴더명·쌍수 포함)
② 홈페이지 `cases/{폴더}/` 에 png 업로드 ③ Storage `library/cases/{폴더}/` 에 webp 업로드.
시트의 G(이미지URL)에 값을 넣으면 폴더 규칙 대신 그 URL 이 우선한다 — 예외 케이스용.

**동시 편집 잠금** — 진료실 PC 여러 대가 같은 환자를 열 수 있어 `locked_by`/`locked_at`
기반 소프트 락을 쓴다 (5분 지나면 stale). [reports.js](src/lib/reports.js) 의
`acquireLock` / `isOtherPcEditing`. PC 식별자는 localStorage ([session.js](src/lib/session.js)).

---

## 작업 시 주의

- **확인은 배포 사이트에서** 한다. 로컬과 배포가 같은 Supabase 를 보므로 로컬 작업도 실제 데이터를 건드린다.
- 환자 실명·생년월일이 들어간 실데이터다. 로그·커밋·이슈에 환자 정보를 남기지 말 것.
- API 키·비밀번호를 코드에 넣지 말 것.
- 직원(6030primes)도 같은 저장소를 `.bat` 스크립트로 직접 push 한다
  (`2026 모바일진단서앱` 네트워크 폴더). 강제 push·히스토리 재작성 금지.
- 번들이 657kB (gzip 192kB) 로 코드 스플리팅 경고가 뜬다. 현재는 의도적으로 방치 중.
