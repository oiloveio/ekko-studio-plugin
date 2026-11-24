import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, realpath, lstat, mkdtemp, rm, chmod } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { executable, loginState, cli, argsFor, threadId } from './engine.mjs';
import { deviceLogin } from './device.mjs';

function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function scope(identity) {
  const { userId, profile } = identity ?? {};
  if (!((typeof userId === 'string' && userId.length) || Number.isSafeInteger(userId)) || typeof profile !== 'string' || !profile) throw Error('Studio 未提供可验证的账号与 Profile 身份。');
  return hash([userId,profile]);
}
const contains = (dir,path) => { const rel=relative(dir,path); return rel==='' || (rel!=='..' && !rel.startsWith('../') && !isAbsolute(rel)); };

const maxAccounts=12;
const empty=()=>({accounts:[],mode:'round-robin',preferred:null,last:null,sessions:{}});

async function protect(path,mode,kind) {
  const st=await lstat(path);
  if((kind==='directory'?!st.isDirectory():!st.isFile())||(process.getuid&&st.uid!==process.getuid())) throw Error('账号数据路径类型或所有者不正确。');
  if((st.mode&0o777)!==mode)await chmod(path,mode);
  if(((await lstat(path)).mode&0o777)!==mode)throw Error('服务器无法设置账号数据的私有权限。');
}
async function privateDirectory(path) {
  await mkdir(path,{recursive:true,mode:0o700});
  await protect(path,0o700,'directory');
}
async function save(path,state) {
  const tmp=`${path}.${randomUUID()}.tmp`;
  await writeFile(tmp,JSON.stringify(state),{mode:0o600,flag:'wx'});
  try{await protect(tmp,0o600,'file');await rename(tmp,path);}
  finally{await rm(tmp,{force:true});}
}
export function selectAccount(state,ready) {
  if (state.mode==='manual') return ready.find(a=>a.id===state.preferred);
  const ids=state.accounts.map(a=>a.id), index=ids.indexOf(state.last);
  for (let i=1;i<=ids.length;i++) { const found=ready.find(a=>a.id===ids[(index+i)%ids.length]); if(found) return found; }
}

export function apply(ctx, runtime={executable,loginState,cli}) {
  const locks=new Map();
  const active=new Set();
  const statusSlots=new Set();
  const jobs=new Map();
  let pending=0;
  const busy=key=>[...active].some(id=>id.startsWith(key));
  const discard=(key,job)=>{if(jobs.get(key)===job)jobs.delete(key);clearTimeout(job.cleanup);};
  function serial(key,fn) {
    const job=(locks.get(key)??Promise.resolve()).catch(()=>{}).then(fn);
    locks.set(key,job);
    void job.finally(()=>{if(locks.get(key)===job) locks.delete(key);}).catch(()=>{});
    return job;
  }
  async function location(identity) {
    const key=scope(identity), base=join(ctx.paths.dataDir,'codex-users'), root=join(base,key);
    await privateDirectory(base);await privateDirectory(root);
    return {key,root,path:join(root,'pool.json')};
  }
  async function load(path) { try { return JSON.parse(await readFile(path,'utf8')); } catch(e) { if(e.code==='ENOENT')return empty(); throw Error('账号索引无法读取；为避免换错账号，已停止。'); } }
  async function homeFor(root,id) {
    if(!threadId(id)) throw Error('账号槽位无效。');
    const home=join(root,id);
    await protect(home,0o700,'directory');
    return home;
  }
  async function status(path,root,id,signal) {
    try { return await runtime.loginState(path,await homeFor(root,id),signal); } catch { return 'unavailable'; }
  }
  const getPath=()=>runtime.executable(ctx.config);
  const rpc=ctx.extensions.rpc;
  rpc.register('settings',async(_input,run)=>{
    const {root,path,key}=await location(run.identity);
    if(statusSlots.has(key)) throw Error('正在检查账号，请稍后重试。');
    statusSlots.add(key);
    try {
      const s=await load(path); const bin=await getPath().catch(()=>null);
      return {available:!!bin,mode:s.mode,preferred:s.preferred,accounts:await Promise.all(s.accounts.map(async a=>({id:a.id,label:a.label,plan:a.plan??null,disabled:!!a.disabled,status:bin?await status(bin,root,a.id,run.signal):'unavailable'})))};
    } finally { statusSlots.delete(key); }
  });
  rpc.register('add-account',async(input,run)=>{
    const label=typeof input?.label==='string'?input.label.trim():'';
    if(!label || label.length>48 || /[\u0000-\u001f\u007f]/u.test(label)) throw Error('请输入 1–48 字的账号别名。');
    const {key,root,path}=await location(run.identity);
    return serial(key,async()=>{
      const s=await load(path); if(s.accounts.length>=maxAccounts) throw Error('最多支持 12 个账号。');
      if(s.accounts.some(a=>a.label===label)) throw Error('账号别名已存在。');
      const id=randomUUID(); await privateDirectory(join(root,id));
      s.accounts.push({id,label}); await save(path,s); return {id};
    });
  });
  rpc.register('start-login',async(input,run)=>{
    const {key,root,path}=await location(run.identity);
    const bin=await getPath();
    return serial(key,async()=>{
      const s=await load(path), a=s.accounts.find(x=>x.id===input?.id);
      if(!a)throw Error('找不到该账号槽位。');
      if(!a.owner && Object.values(s.sessions).some(x=>x.account===a.id)) throw Error('旧槽位已有会话，但缺少可核对的账号身份；为避免换错号，请添加新槽位。');
      const old=jobs.get(key);
      if(old?.controller)throw Error('已有授权进行中，请先完成或取消。');
      if(pending>=8)throw Error('服务器正在处理其他授权，请稍后重试。');
      const home=await homeFor(root,a.id), stage=await mkdtemp(join(root,'.device-'));
      try{await protect(stage,0o700,'directory');}catch(e){await rm(stage,{recursive:true,force:true});throw e;}
      if(pending>=8){await rm(stage,{recursive:true,force:true});throw Error('服务器正在处理其他授权，请稍后重试。');}
      if(old)discard(key,old);
      const job={id:a.id,state:'starting',controller:new AbortController()};
      jobs.set(key,job);pending++;
      void (async()=>{
        try {
          const result=await (runtime.deviceLogin??deviceLogin)(bin,stage,{signal:job.controller.signal,onCode:({url,code})=>{
            if(!job.controller.signal.aborted)Object.assign(job,{state:'waiting',url,code});
          }});
          await serial(key,async()=>{
            if(job.controller.signal.aborted)throw Error('授权已取消。');
            const latest=await load(path), slot=latest.accounts.find(x=>x.id===a.id);
            if(!slot || busy(key))throw Error('账号或会话正忙，未替换原授权，请稍后重试。');
            const owner=hash([result.userId,result.workspaceId]);
            if(slot.owner && slot.owner!==owner)throw Error('授权的是另一个账号或工作区；原绑定未更改。');
            if(latest.accounts.some(x=>x.id!==slot.id&&x.owner===owner))throw Error('此账号和工作区已绑定到另一个槽位。');
            const auth=join(stage,'auth.json');
            try{await protect(auth,0o600,'file');}catch{throw Error('官方授权未生成可保护的凭据；原绑定未更改。');}
            if(job.controller.signal.aborted)throw Error('授权已取消。');
            job.state='saving';delete job.code;delete job.url;
            await rename(auth,join(home,'auth.json'));
            slot.owner=owner;slot.plan=result.plan;await save(path,latest);
          });
          job.state='complete';
        } catch(e) {
          job.state=job.controller.signal.aborted?'cancelled':'failed';
          job.message=e?.code?'授权无法保存；请联系管理员检查服务器文件权限。':(e?.message??'授权失败。');
        } finally {
          delete job.url;delete job.code;delete job.controller;
          pending--;await rm(stage,{recursive:true,force:true}).catch(()=>{});
          if(jobs.get(key)===job){job.cleanup=setTimeout(()=>discard(key,job),5*60*1000);job.cleanup.unref();}
        }
      })();
      return {state:job.state};
    });
  });
  rpc.register('login-progress',async(_input,run)=>{
    const job=jobs.get(scope(run.identity));
    if(!job)return {state:'idle'};
    const {id,state,url,code,message}=job;
    return {id,state,...(typeof url==='string'?{url}:{}),...(typeof code==='string'?{code}:{}),...(typeof message==='string'?{message}:{})};
  });
  rpc.register('cancel-login',async(_input,run)=>{
    const job=jobs.get(scope(run.identity));
    if(job?.controller&&job.state!=='saving'){job.controller.abort();delete job.code;delete job.url;job.state='cancelled';}
    return {ok:true};
  });
  rpc.register('manage-account',async(input,run)=>{
    const {key,root,path}=await location(run.identity);
    return serial(key,async()=>{
      const s=await load(path), a=s.accounts.find(x=>x.id===input?.id);
      if(!a)throw Error('找不到该账号槽位。');
      if(!['enable','disable','remove'].includes(input.action))throw Error('未知操作。');
      if(input.action==='remove'){
        if(busy(key)||jobs.get(key)?.controller)throw Error('有会话或授权正在运行，请稍后移除。');
        await rm(join(root,a.id),{recursive:true,force:true});
        s.accounts=s.accounts.filter(x=>x.id!==a.id);
        const job=jobs.get(key);if(job?.id===a.id)discard(key,job);
      } else a.disabled=input.action==='disable';
      if(s.preferred===a.id && input.action!=='enable')s.preferred=null;
      await save(path,s);return {ok:true};
    });
  });
  rpc.register('save-settings',async(input,run)=>{
    const {key,path}=await location(run.identity);
    return serial(key,async()=>{
      const s=await load(path);
      if(!['round-robin','manual'].includes(input?.mode)) throw Error('调度方式无效。');
      if(input.mode==='manual'&&!s.accounts.some(a=>a.id===input.preferred&&!a.disabled)) throw Error('请选择一个已启用的账号。');
      s.mode=input.mode; s.preferred=input.mode==='manual'?input.preferred:null;
      await save(path,s); return {ok:true};
    });
  });
  const reg=ctx.extensions.agents.register({
    id:'codex',name:'Codex 多账号',vendor:'oiloveio',agentApiVersion:1,
    getStatus:async()=>{
      try { const bin=await getPath(); const v=await runtime.cli(bin,['--version'],{home:'/tmp',cwd:'/tmp'}); const m=v.stdout.match(/^codex-cli (\d+\.\d+\.\d+(?:-[\w.-]+)?)\s*$/m); return v.code===0&&m?{installed:true,version:m[1],source:'native-cli'}:{installed:false,version:'',error:'无法识别 Codex CLI 版本。'}; }
      catch {return {installed:false,version:'',source:'not-installed'};}
    },
    management:{settings:()=>({viewId:'agent-settings'}),installGuideUrl:'https://developers.openai.com/codex/cli/'},
    modes:{global:{listModels:async()=>({status:'ready',scope:'builtin',source:'codex-cli',models:[{id:'native',name:'Codex 默认模型',isDefault:true}]})}},
    features:{surfaces:['chat'],streaming:true,resume:true},
    runtime:{createSession(session){
      return {dispose(){},async run(input,run){
        if (run.mode!=='global') throw Error('请使用 Codex 多账号的全局模式。');
        const {key,root,path}=await location(run.identity);
        const sessionId=run.identity?.sessionId;
        if(typeof sessionId!=='string'||!sessionId|| session.identity?.sessionId!==sessionId || scope(session.identity)!==key) throw Error('Studio 会话身份不匹配。');
        const sid=hash(sessionId), lock=key+sid;
        if(active.has(lock)) throw Error('该会话已有 Codex 请求在运行。');
        active.add(lock);
        try {
          const cwd=await realpath(run.paths.workspaceDir);
          const secrets=await realpath(join(ctx.paths.dataDir,'codex-users'));
          if(contains(cwd,secrets)||contains(secrets,cwd)) throw Error('请选择独立项目工作区，不要将包含凭据目录的上级路径设为工作区。');
          const bin=await getPath();
          const images=[], parts=[];
          for (const part of input.input) {
            if (part.type==='text') parts.push(part.text);
            else {
              const attachment=await run.attachments.resolve(part.assetId);
              if (part.type==='image') images.push(attachment.localPath);
              else parts.push(`附件（本地路径，请按需读取）：${JSON.stringify({name:part.name,path:attachment.localPath})}`);
            }
          }
          const prompt=[...input.instructions.map(i=>i.text),...parts].join('\n\n');
          if(Buffer.byteLength(prompt)>512*1024 || images.length>12) throw Error('本轮输入过大。');
          const entry=await serial(key,async()=>{
            const s=await load(path); const pinned=s.sessions[sid];
            if(pinned){
              if(!s.accounts.some(a=>a.id===pinned.account))throw Error('该会话绑定的账号已移除，不会换号。');
              return pinned;
            }
            const abort=run.signal;
            if(abort?.aborted) throw Error('Codex 操作已取消。');
            const candidates=s.accounts.filter(a=>!a.disabled&&(s.mode!=='manual'||a.id===s.preferred));
            const checked=await Promise.all(candidates.map(async a=>({a,ready:await status(bin,root,a.id,abort)==='chatgpt'})));
            const ready=checked.filter(x=>x.ready).map(x=>x.a);
            if(abort?.aborted) throw Error('Codex 操作已取消。');
            const a=selectAccount(s,ready);
            if(!a) throw Error('没有已登录的 ChatGPT 订阅账号；请在账号页配置，手动模式不会回退到其他账号。');
            const e={account:a.id}; s.sessions[sid]=e; if(s.mode==='round-robin') s.last=a.id; await save(path,s); return e;
          });
          const home=await homeFor(root,entry.account);
          if(await runtime.loginState(bin,home,run.signal)!=='chatgpt') throw Error('该会话绑定的账号未登录；请重新登录该账号，不会换号。');
          let thread=entry.thread, messages=[], usage, failed=false, finished=false;
          await run.output.emit({type:'status',phase:'working',message:'Codex 正在运行（本会话固定账号）'});
          const timeout=Math.min(20*60*1000,Number.isFinite(run.deadlineAt)?run.deadlineAt-Date.now():20*60*1000);
          if(timeout<=0||run.signal?.aborted) throw Error('Codex 请求已过期或取消。');
          const result=await runtime.cli(bin,argsFor({thread,images}),{home,cwd,signal:run.signal,prompt,timeout,onEvent:async event=>{
            if(event.type==='thread.started') {
              if(!threadId(event.thread_id)||(thread&&thread!==event.thread_id)) throw Error('Codex 返回了不一致的会话标识。');
              if(!thread) {
                thread=event.thread_id;
                await serial(key,async()=>{ const s=await load(path); s.sessions[sid].thread=thread; await save(path,s); });
              }
            }
            if(event.type==='item.completed'&&event.item?.type==='agent_message'&&typeof event.item.text==='string') {
              messages.push(event.item.text); await run.output.emit({type:'text.delta',text:(messages.length>1?'\n\n':'')+event.item.text});
            }
            if(event.type==='turn.failed') failed=true;
            if(event.type==='turn.completed'){ finished=true; const u=event.usage; if(u)usage={inputTokens:u.input_tokens??null,outputTokens:u.output_tokens??null,cacheReadTokens:u.cached_input_tokens??null,isEstimated:false}; }
          }});
          if(result.code!==0||failed||!finished||!thread) throw Error('Codex 本轮失败（可能是额度、订阅、网络或沙箱问题）；未自动换号或重放。');
          return {content:[{type:'text',text:messages.join('\n\n')||'Codex 已完成（无文本回复）。'}],finishReason:'stop',...(usage?{usage}:{})};
        } finally { active.delete(lock); }
      }};
    }},
  });
  return ()=>{for(const [key,job] of jobs){job.controller?.abort();discard(key,job);}reg.dispose();};
}
