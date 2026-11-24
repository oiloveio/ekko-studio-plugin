import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { apply, scope, selectAccount } from '../server.mjs';
import { argsFor,engineEnvironment,loginState,cli } from '../engine.mjs';
const tid='11111111-2222-3333-4444-555555555555';
const input={input:[{type:'text',text:'hello'}],instructions:[],history:[],options:{}};

test('round robin skips signed-out accounts; manual does not fall back',()=>{
 const a={id:'a'},b={id:'b'},c={id:'c'};const s={accounts:[a,b,c],last:'a',mode:'round-robin'};
 assert.equal(selectAccount(s,[a,c]),c);assert.equal(selectAccount({...s,last:'c'},[a,c]),a);
 assert.equal(selectAccount({...s,mode:'manual',preferred:'b'},[a,c]),undefined);
});
test('auth is isolated by trusted identity and not inherited by the CLI',()=>{
 assert.notEqual(scope({userId:'u',profile:'a'}),scope({userId:'u',profile:'b'}));
 assert.throws(()=>scope({profile:'a'}));
 process.env.OPENAI_API_KEY='mock-secret';process.env.OPENAI_BASE_URL='http://invalid';
 try{const env=engineEnvironment('/a');assert.equal(env.HOME,'/a');assert.equal(env.CODEX_HOME,'/a');assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.OPENAI_BASE_URL,undefined);}finally{delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_BASE_URL;}
 const cmd=argsFor({thread:tid,images:['/project/a.png']});assert.deepEqual(cmd.slice(0,2),['exec','resume']);assert.deepEqual(cmd.slice(-2),[tid,'-']);assert.ok(cmd.includes('sandbox_mode="workspace-write"'));assert.ok(!cmd.some(s=>s.startsWith('--dangerously')));assert.throws(()=>argsFor({thread:'--last'}));
});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'ekko-codex-test-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const cwd=join(dir,'project'),data=join(dir,'data');await mkdir(cwd);await mkdir(data);
 const state={calls:[],notLoggedIn:new Set(),fail:false};const rpc=new Map();let agent;
 const plugin={paths:{dataDir:data},extensions:{rpc:{register:(k,v)=>rpc.set(k,v)},agents:{register:a=>{agent=a;return{dispose(){}};}}}};
 const fake={executable:async()=>'/official/codex',loginState:async(_p,h)=>state.notLoggedIn.has(h.split('/').at(-1))?'signed-out':'chatgpt',cli:async(_path,args,o)=>{
   if(!o.onEvent)return{code:0,stdout:'codex-cli 0.172.0\n'};
   state.calls.push({args,home:o.home,cwd:o.cwd});await o.onEvent({type:'thread.started',thread_id:tid});
   if(state.fail){await o.onEvent({type:'turn.failed'});return{code:1};}
   await o.onEvent({type:'item.completed',item:{type:'agent_message',text:'done'}});
   await o.onEvent({type:'turn.completed',usage:{input_tokens:3,output_tokens:2}});return{code:0};
 }};
 apply(plugin,fake);const identity={userId:'u',profile:'default'};const ctx={identity,signal:new AbortController().signal};
 const api=(name,data={})=>rpc.get(name)(data,ctx);
 function turn(id,{workspace=cwd,owner=identity}={}){const i={...owner,sessionId:id};const s=agent.runtime.createSession({identity:i});return s.run(input,{identity:i,mode:'global',paths:{workspaceDir:workspace},output:{emit:async()=>{}},signal:ctx.signal});}
 return{state,rpc,api,turn,identity,ctx,agent,data,reload(){apply(plugin,fake);}};
}
test('two accounts rotate for new sessions, restart resumes on original account',async t=>{
 const f=await fixture(t);const a=await f.api('add-account',{label:'A'}),b=await f.api('add-account',{label:'B'});
 assert.equal((await f.agent.getStatus()).version,'0.172.0');assert.equal((await f.api('settings')).accounts.length,2);
 const aLogin=await f.api('login-command',{id:a.id});assert.match(aLogin.command,/--device-auth/);
 assert.match(aLogin.command,new RegExp(a.id));
 const out=await f.turn('s1');assert.equal(out.content[0].text,'done');assert.equal(out.usage.inputTokens,3);
 await f.turn('s2');f.reload();await f.turn('s1');
 assert.deepEqual(f.state.calls.map(x=>x.home.split('/').at(-1)),[a.id,b.id,a.id]);
 assert.equal(f.state.calls[2].args[1],'resume');assert.ok(f.state.calls[2].args.includes(tid));
});
test('failed turn is never replayed; signed-out pinned session never moves',async t=>{
 const f=await fixture(t);const a=await f.api('add-account',{label:'A'}),b=await f.api('add-account',{label:'B'});
 f.state.fail=true;await assert.rejects(f.turn('s1'),/未自动换号/);assert.equal(f.state.calls.length,1);
 f.state.notLoggedIn.add(a.id);f.state.fail=false;
 await assert.rejects(f.turn('s1'),/不会换号/);assert.equal(f.state.calls.length,1);
 await f.turn('s2');assert.equal(f.state.calls[1].home.split('/').at(-1),b.id);
});
test('manual choice and cross-user access are checked server-side',async t=>{
 const f=await fixture(t);const a=await f.api('add-account',{label:'A'}),b=await f.api('add-account',{label:'B'});
 const other={identity:{userId:'other',profile:'default'}};
 assert.deepEqual((await f.rpc.get('settings')({},other)).accounts,[]);
 await assert.rejects(f.rpc.get('login-command')({id:a.id},other),/找不到/);
 await f.api('save-settings',{mode:'manual',preferred:b.id});await f.turn('s1');assert.equal(f.state.calls[0].home.split('/').at(-1),b.id);
 await assert.rejects(f.turn('s2',{workspace:f.data}),/独立项目/);
});
test('process cancellation kills an isolated mock CLI',async t=>{
 const home=await mkdtemp(join(tmpdir(),'ekko-codex-proc-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const script=join(home,'fake.mjs');await writeFile(script,`setInterval(()=>{},100);`);
 const abort=new AbortController();const p=cli(process.execPath,[script],{home,cwd:home,signal:abort.signal});setTimeout(()=>abort.abort(),50);
 await assert.rejects(p,/取消/);
});
test('real CLI signed-out check in a fresh home (when supplied)',{skip:!process.env.TEST_CODEX_BINARY},async t=>{
 const home=await mkdtemp(join(tmpdir(),'ekko-codex-real-'));t.after(()=>rm(home,{recursive:true,force:true}));
 assert.equal(await loginState(process.env.TEST_CODEX_BINARY,home),'signed-out');
});
