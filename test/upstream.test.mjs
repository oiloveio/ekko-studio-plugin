import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkUpstreams, compareVersions } from '../scripts/check-upstream.mjs'

test('只对较新的稳定版本提示更新', async () => {
  assert.equal(compareVersions('v2.10.0', 'v2.2.1'), 1)
  assert.equal(compareVersions('2.2.1', 'v2.2.1'), 0)
  assert.throws(() => compareVersions('v2.3.0-rc.1', 'v2.2.1'))
  const result = await checkUpstreams({ mail: { repository: 'example/mail', baseline: 'v2.2.1' } }, async () => ({ ok: true, json: async () => ({ tag_name: 'v2.3.0', draft: false, prerelease: false }) }))
  assert.equal(result[0].update, true)
})
test('接口异常或非正式版本不能被误报为已是最新', async () => {
  const config = { mail: { repository: 'example/mail', baseline: 'v2.2.1' } }
  await assert.rejects(checkUpstreams(config, async () => ({ ok: false, status: 403 })), /403/)
  await assert.rejects(checkUpstreams(config, async () => ({ ok: true, json: async () => ({ tag_name: 'v2.3.0', prerelease: true }) })), /非正式/)
})
