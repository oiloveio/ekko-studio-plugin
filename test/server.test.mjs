import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildArgs, invoke } from '../server.mjs'

test('只允许支持的操作并限制参数',()=>{assert.throws(()=>buildArgs({action:'send'}));assert.throws(()=>buildArgs({action:'read',id:'--seen'}));assert.throws(()=>buildArgs({action:'list',pageSize:101}));assert.deepEqual(buildArgs({action:'read',id:'42'}),['--json','message','read','--','42'])})
test('真实 CLI 可以执行版本查询',async()=>{const r=await invoke(['--version']);assert.equal(r.code,0);assert.match(r.out,/himalaya v2\./)})
test('取消请求',async()=>{const c=new AbortController();c.abort();await assert.rejects(invoke(['--version'],c.signal),/取消/)})
test('跨数据块的 UTF-8 字符保持完整',async()=>{const script="const b=Buffer.from('邮件');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),20)";const r=await invoke(['-e',script],undefined,process.execPath);assert.equal(r.out,'邮件')})
