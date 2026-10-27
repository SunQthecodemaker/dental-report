/**
 * Claude 호출 — 공식 Claude Code CLI(`claude -p`) 를 자식 프로세스로 실행.
 *
 * Max 구독 인증:
 *   - `claude setup-token` 으로 발급한 1년 토큰을 CLAUDE_CODE_OAUTH_TOKEN 환경변수로 받는다
 *     (워커 .env → 자식 프로세스에 그대로 상속)
 *
 * 도구·설정·MCP·세션 저장 전부 끔 — 순수 텍스트 생성만.
 * (2026-10 이전엔 Agent SDK 를 직접 import 했으나 PC2 Windows 에서 0xC0000409 크래시 반복 → CLI 로 교체)
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'

/**
 * 공용 자식 프로세스 실행기 — stdin 으로 프롬프트를 넣고 stdout 전체를 받는다.
 * timeoutMs 를 넘기면 SIGKILL.
 */
export function runCli(bin, args, { input = '', timeoutMs, env, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${bin} timeout after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`${bin} exited ${code}: ${(err || out).slice(0, 400)}`))
    })
    child.stdin.end(input)
  })
}

export function withJsonDirective(userMessage, expectJson) {
  return expectJson
    ? `${userMessage}\n\n반드시 JSON 한 덩어리만 출력하시오. 코드블록(\`\`\`json … \`\`\`)이나 부연 설명·인사 모두 금지.`
    : userMessage
}

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userMessage
 * @param {string} [params.model='sonnet']
 * @param {boolean} [params.expectJson=false]
 * @param {number} [params.timeoutMs=100000]
 * @returns {Promise<string>} assistant 의 텍스트 전체
 */
export async function callClaude({ systemPrompt, userMessage, model = 'sonnet', expectJson = false, timeoutMs = 100_000 }) {
  // 빈 작업 폴더에서 실행 — 어떤 CLAUDE.md·프로젝트 설정도 읽히지 않게
  const cwd = mkdtempSync(join(tmpdir(), 'dental-claude-'))
  try {
    const stdout = await runCli(CLAUDE_BIN, [
      '-p',
      '--model', model,
      '--system-prompt', systemPrompt,
      '--output-format', 'json',
      '--tools', '',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--no-session-persistence',
    ], { input: withJsonDirective(userMessage, expectJson), timeoutMs, cwd })

    let envelope
    try { envelope = JSON.parse(stdout) }
    catch { throw new Error('claude 출력 파싱 실패: ' + stdout.slice(0, 200)) }
    if (envelope.is_error) throw new Error('claude 오류: ' + String(envelope.result || envelope.terminal_reason).slice(0, 300))

    const text = String(envelope.result || '').trim()
    if (!text) throw new Error('Claude 응답 비어있음')
    return text
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

/**
 * Claude 응답이 JSON 형식이라고 가정하고 파싱.
 * 코드블록·앞뒤 설명 등 박힌 경우도 best-effort 로 추출.
 */
export function parseJsonReply(text) {
  if (!text) throw new Error('빈 응답')
  const trimmed = text.trim()

  // 1) 그대로 JSON?
  try { return JSON.parse(trimmed) } catch { /* fallthrough */ }

  // 2) ```json … ``` 코드블록 추출
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch { /* fallthrough */ }
  }

  // 3) 첫 { … 마지막 } 추출
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const candidate = trimmed.slice(first, last + 1)
    try { return JSON.parse(candidate) } catch { /* fallthrough */ }
  }

  throw new Error('JSON 파싱 실패: ' + trimmed.slice(0, 200))
}
