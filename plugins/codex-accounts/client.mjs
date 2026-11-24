export function mount(root,ctx){
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
  const option=(text,value)=>{const n=el('option',text);n.value=value;return n;};
  const main=el('section');main.className='codex-pool';
  const style=el('style',`
    .codex-pool{box-sizing:border-box;margin:auto;max-width:880px;padding:24px;font:14px/1.6 system-ui;color:inherit}
    .codex-pool h2,.codex-pool h3,.codex-pool p{margin:0}
    .codex-pool .intro{opacity:.75;margin:.35rem 0 1.15rem}
    .codex-pool .box{border:1px solid color-mix(in srgb,currentColor 19%,transparent);border-radius:12px;padding:16px;margin-bottom:14px}
    .codex-pool .flex{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .codex-pool .row{justify-content:space-between;padding:10px 0;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
    .codex-pool .list{list-style:none;margin:8px 0 0;padding:0}
    .codex-pool .muted{opacity:.7}.codex-pool .metric{padding:3px 10px;border-radius:999px;background:color-mix(in srgb,currentColor 9%,transparent)}
    .codex-pool button,.codex-pool input,.codex-pool select,.codex-pool a{border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:8px;padding:6px 11px;font:inherit;color:inherit;background:transparent}
    .codex-pool button,.codex-pool a{cursor:pointer}.codex-pool button:disabled{opacity:.5;cursor:default}
    .codex-pool .primary{background:#275de3;color:#fff;border-color:#275de3;text-decoration:none}
    .codex-pool .device{font:700 21px ui-monospace,monospace;letter-spacing:.08em;user-select:all;margin:.5rem 0}
    .codex-pool [hidden]{display:none!important}.codex-pool :focus-visible{outline:2px solid #508aff;outline-offset:2px}
  `);
  const status=el('p');status.setAttribute('role','status');
  const form=el('form');form.className='flex';
  const input=el('input');input.maxLength=48;input.required=true;input.placeholder='账号别名，例如：个人 Plus';input.setAttribute('aria-label','账号别名');
  const add=el('button','绑定 Codex');add.className='primary';add.type='submit';form.append(input,add);
  const auth=el('section');auth.className='box';auth.hidden=true;
  const authText=el('p');authText.setAttribute('role','status');
  const code=el('p');code.className='device';code.setAttribute('aria-label','一次性设备码');
  const authActions=el('div');authActions.className='flex';
  const open=el('a','打开 OpenAI 授权');open.className='primary';open.href='https://auth.openai.com/codex/device';open.target='_blank';open.rel='noopener noreferrer';
  const copy=button('复制设备码',async()=>{try{await navigator.clipboard.writeText(code.textContent);status.textContent='已复制，请仅在 OpenAI 官方授权页使用。';}catch{status.textContent='无法自动复制，请选中设备码手动复制。';}});
  const cancel=button('取消授权',()=>work(async()=>{await rpc('cancel-login');await progress();}));
  authActions.append(open,copy,cancel);auth.append(el('h3','OpenAI 官方设备授权'),authText,code,authActions);
  const accountBox=el('section');accountBox.className='box';
  const summary=el('div');summary.className='flex';
  const accounts=el('ul');accounts.className='list';
  const refresh=button('刷新状态',()=>work(render));
  const accountHead=el('div');accountHead.className='flex';accountHead.append(el('h3','账号列表'),refresh);
  accountBox.append(accountHead,summary,accounts);
  const schedule=el('section');schedule.className='box';
  const mode=el('select');mode.setAttribute('aria-label','新会话调度方式');mode.append(option('新会话轮询','round-robin'),option('固定账号','manual'));
  const preferred=el('select');preferred.setAttribute('aria-label','新会话固定账号');
  const sync=()=>{preferred.hidden=mode.value!=='manual';};mode.onchange=sync;
  const save=button('保存调度',()=>work(async()=>{await rpc('save-settings',{mode:mode.value,preferred:preferred.value});await render();status.textContent='调度已保存。';}));
  const controls=el('div');controls.className='flex';controls.append(mode,preferred,save);
  schedule.append(el('h3','新会话调度'),el('p','只对新会话生效；已开的会话不会换号。'),controls);
  const addBox=el('section');addBox.className='box';addBox.append(el('h3','添加账号'),form);
  const intro=el('p','在这里绑定和管理订阅，再在新对话中选择「Codex 多账号」Agent。');intro.className='intro';
  main.append(style,el('h2','Codex 多账号'),intro,addBox,auth,accountBox,schedule,status);root.replaceChildren(main);
  const labels={chatgpt:'已绑定','signed-out':'待授权',other:'不是 ChatGPT 登录',unavailable:'无法验证'};
  let disposed=false,busy=false,timer,reading=false,loginState='idle',lastState='idle';
  const rpc=(name,data={})=>ctx.rpc.call(name,data);
  const pending=()=>['starting','waiting','saving'].includes(loginState);
  function start(id){return rpc('start-login',{id}).then(()=>{loginState='starting';add.disabled=true;return progress(true);});}
  async function render(){
    const s=await rpc('settings');if(disposed)return;
    add.disabled=!s.available||pending();
    if(!s.available)status.textContent='服务器未找到 Codex CLI，请检查插件配置。';
    const ready=s.accounts.filter(a=>!a.disabled&&a.status==='chatgpt').length;
    summary.replaceChildren(...[`全部 ${s.accounts.length}`,`可用 ${ready}`,`停用 ${s.accounts.filter(a=>a.disabled).length}`].map(t=>{const n=el('span',t);n.className='metric';return n;}));
    accounts.replaceChildren();preferred.replaceChildren(option('请选择已启用账号',''));
    if(!s.accounts.length)accounts.append(el('li','还没有账号，可从上方开始绑定。'));
    for(const a of s.accounts){
      const row=el('li');row.className='flex row';
      const name=el('div');name.append(el('strong',a.label),el('p',[a.disabled?'已停用':labels[a.status]??'未知',a.plan].filter(Boolean).join(' · ')));
      const actions=el('div');actions.className='flex';
      const bind=button(a.status==='chatgpt'?'重新授权':'继续绑定',()=>work(()=>start(a.id)));bind.disabled=pending()||!s.available;bind.dataset.bind='';
      const toggle=button(a.disabled?'启用':'停用',()=>work(async()=>{await rpc('manage-account',{id:a.id,action:a.disabled?'enable':'disable'});await render();}));
      const remove=button('移除',()=>{remove.hidden=true;confirm.hidden=false;keep.hidden=false;confirm.focus();});
      const confirm=button('确认移除（旧会话不能续跑）',()=>work(async()=>{await rpc('manage-account',{id:a.id,action:'remove'});await render();}));
      const keep=button('保留账号',()=>{remove.hidden=false;confirm.hidden=true;keep.hidden=true;remove.focus();});confirm.hidden=keep.hidden=true;
      actions.append(bind,toggle,remove,confirm,keep);row.append(name,actions);accounts.append(row);
      if(!a.disabled)preferred.append(option(a.label,a.id));
    }
    mode.value=s.mode;preferred.value=s.preferred??'';sync();
  }
  async function progress(forceRender=false){
    if(reading||disposed)return;
    clearTimeout(timer);reading=true;
    try{
      const p=await rpc('login-progress');if(disposed)return;
      const changed=lastState!==p.state;lastState=loginState=p.state;
      auth.hidden=p.state==='idle';code.hidden=open.hidden=copy.hidden=p.state!=='waiting';cancel.hidden=!pending()||p.state==='saving';
      code.textContent=p.state==='waiting'?p.code:'';
      authText.textContent=({starting:'正在联系 OpenAI 获取设备码…',waiting:'在 OpenAI 官方页面登录你要绑定的账号，输入下方一次性代码。这里会自动更新结果。',saving:'正在保存授权…',complete:'授权成功，账号已绑定。',failed:p.message??'授权失败，请重试。',cancelled:'已取消授权。'})[p.state]??'';
      if(changed||forceRender)await render();
    }catch{if(!disposed)status.textContent='暂时无法读取授权状态，可刷新页面后继续。';}
    finally{reading=false;if(!disposed&&pending())timer=setTimeout(progress,1500);}
  }
  async function work(fn){
    if(busy||disposed)return;
    busy=true;main.setAttribute('aria-busy','true');status.textContent='';
    try{await fn();}catch{if(!disposed)status.textContent='操作未完成。请检查账号是否重名、是否已有授权在等待，或刷新状态后重试。';}
    finally{busy=false;if(!disposed)main.removeAttribute('aria-busy');}
  }
  form.onsubmit=e=>{e.preventDefault();void work(async()=>{const r=await rpc('add-account',{label:input.value});input.value='';try{await start(r.id);}catch(e){await render();throw e;}});};
  const resume=()=>{if(document.visibilityState==='visible')void progress();};
  document.addEventListener('visibilitychange',resume);
  void work(async()=>{await render();await progress();});
  return ()=>{disposed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',resume);root.replaceChildren();};
}
