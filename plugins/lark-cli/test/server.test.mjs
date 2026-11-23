import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, executeCli, validate } from '../server.mjs'

test('注册工具并运行 CLI 帮助', async () => {
  let tool
  apply({ extensions: { tools: { register(value) { tool = value; return () => {} } } } })
  assert.equal(tool.readOnly, false)
  const result = await tool.execute({ args: ['docs', '--help'] }, {})
  assert.equal(result.ok, true)
  assert.match(result.content, /docs/i)
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
