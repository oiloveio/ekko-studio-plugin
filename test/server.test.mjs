import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildArgs, invoke } from '../server.mjs'

test('只允许支持的操作并限制参数',()=>{assert.throws(()=>buildArgs({action:'send'}));assert.throws(()=>buildArgs({action:'read',id:'--seen'}));assert.throws(()=>buildArgs({action:'list',pageSize:101}));assert.deepEqual(buildArgs({action:'read',id:'42'}),['--json','message','read','--','42'])})
test('真实 CLI 可以执行版本查询',async t=>{let r;try{r=await invoke(['--version'])}catch(e){if(e.code==='ENOENT'){t.skip('未安装 Himalaya，跳过真实 CLI 检查');return}throw e}assert.equal(r.code,0);assert.match(r.out,/himalaya v2\./)})
test('取消请求',async()=>{const c=new AbortController();c.abort();await assert.rejects(invoke(['--version'],c.signal),/取消/)})
test('跨数据块的 UTF-8 字符保持完整',async()=>{const script="const b=Buffer.from('邮件');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),20)";const r=await invoke(['-e',script],undefined,process.execPath);assert.equal(r.out,'邮件')})

test('检查连接只返回账号名和诊断，不返回邮件内容', async t => {
  const { mkdtemp, writeFile, chmod, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { apply } = await import('../server.mjs')
  const dir = await mkdtemp(join(tmpdir(), 'himalaya-fake-'))
  const oldPath = process.env.PATH
  t.after(async () => { process.env.PATH = oldPath; await rm(dir, { recursive: true, force: true }) })
  const binary = join(dir, 'himalaya')
  await writeFile(binary, `#!/bin/sh\ncase "$*" in *--version*) echo 'himalaya v2.2.1';; *'account list'*) echo '{"accounts":[{"name":"work","default":true}]}';; *'mailbox list'*) echo '{"mailboxes":[]}';; *) exit 1;; esac\n`)
  await chmod(binary, 0o700); process.env.PATH = `${dir}:${oldPath}`
  const methods = {}; let prefs = null
  apply({ extensions: { rpc: { register(name, fn) { methods[name] = fn } }, tools: { register() {} } } })
  const store = { namespace() { return this }, async get() { return prefs }, async set(_key, value) { prefs = value } }
  const run = { identity: { userId: 'user', profile: 'default' }, state: { plugin: store } }
  const result = await methods['check-connection']({}, run)
  assert.equal(result.ok, true); assert.equal(result.account, 'work'); assert.equal(result.checks.length, 3)
  await methods['save-settings']({ account: 'work' }, run)
  assert.equal((await methods['get-settings']({}, run)).account, 'work')
  await assert.rejects(methods['save-settings']({ account: '--bad' }, run))
})
