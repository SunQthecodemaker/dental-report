/**
 * Codex 호출 — OpenAI Codex CLI(`codex exec`) 를 ChatGPT 구독 로그인으로 실행. Claude 실패 시 2순위.
 *
 * 로그인은 워커 전용 CODEX_HOME 에 따로 둔다 (헤르메스의 Codex 로그인과 토큰 갱신이 겹치지 않게).
 *   CODEX_HOME=<워커>/.codex-home codex login --device-auth
 * 로그인 파일이 없으면 isCodexReady() = false → 워커가 이 단계를 건너뛴다.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli, withJsonDirective } from './claude.js'

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CODEX_BIN = process.env.CODEX_BIN || join(WORKER_DIR, 'node_modules', '.bin', 'codex')
const CODEX_HOME = process.env.CODEX_HOME || join(WORKER_DIR, '.codex-home')

export function isCodexReady() {
  return existsSync(CODEX_BIN) && existsSync(join(CODEX_HOME, 'auth.json'))
}

/**
 * @returns {Promise<string>} 마지막 assistant 메시지 텍스트
 */
export async function callCodex({ systemPrompt, userMessage, expectJson = false, model, timeoutMs = 80_000, image }) {
  const cwd = mkdtempSync(join(tmpdir(), 'dental-codex-'))
  const outFile = join(cwd, 'last.txt')
  try {
    // codex exec 에는 별도 system 슬롯이 없어 지시문을 프롬프트 앞에 붙인다
    const prompt = `# 지시사항\n${systemPrompt}\n\n# 입력\n${withJsonDirective(userMessage, expectJson)}`
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox', 'read-only',
      '--color', 'never',
      '-o', outFile,
    ]
    if (model) args.push('-m', model)
    if (image) {
      const ext = (image.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const imgFile = join(cwd, `image.${ext}`)
      writeFileSync(imgFile, Buffer.from(image.base64, 'base64'))
      args.push('-i', imgFile)
    }
    args.push('-') // 프롬프트는 stdin
    await runCli(CODEX_BIN, args, { input: prompt, timeoutMs, cwd, env: { CODEX_HOME } })

    const text = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : ''
    if (!text) throw new Error('Codex 응답 비어있음')
    return text
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}
