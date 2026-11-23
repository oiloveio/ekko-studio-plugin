import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { apply, executeCli, validate } from '../server.mjs'

test('解包官方版本并注册工具', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'lark-plugin-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  let tool
  apply({ paths: { dataDir: dir }, extensions: { tools: { register(value) { tool = value; return () => {} } } } })
  assert.equal(tool.readOnly, false)
  const result = await tool.execute({ args: ['docs', '--help'] }, {})
  assert.equal(result.ok, true)
  assert.match(result.content, /docs/i)
  assert.match(execFileSync(join(dir, 'lark-cli-1.0.100'), ['--version'], { encoding: 'utf8' }), /1\.0\.100/)
})

test('拒绝认证管理和跳过高风险确认', () => {
  assert.throws(() => validate(['auth', 'login']))
  assert.throws(() => validate(['docs', 'delete', '--yes']))
})

test('参数不会交给 shell 解释', async () => {
  const result = await executeCli(['schema', '$(echo injected)'])
  assert.notEqual(result.exitCode, 0)
})

test('取消信号会阻止启动', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(executeCli(['docs', '--help'], { signal: controller.signal }), /取消/)
})
