export function mount(root,ctx){
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const main=el('section'); main.style.cssText='margin:auto;max-width:780px;padding:24px;font:14px/1.65 system-ui';
  const status=el('p');status.setAttribute('role','status');
  const accounts=el('ul'); const form=el('form'); const input=el('input');input.maxLength=48;input.required=true;input.placeholder='例如：个人订阅';input.setAttribute('aria-label','账号别名');
  const add=el('button','添加账号'); add.type='submit'; form.append(input,add);
  const mode=el('select');mode.setAttribute('aria-label','新会话调度方式');
  for(const [value,text] of [['round-robin','新会话轮询'],['manual','固定给新会话']]){const o=el('option',text);o.value=value;mode.append(o);}
  const preferred=el('select');preferred.setAttribute('aria-label','新会话首选账号');
  const save=el('button','保存调度'); const refresh=el('button','刷新登录状态');
  const command=el('textarea'); command.readOnly=true;command.rows=4;command.style.width='100%';command.hidden=true; command.setAttribute('aria-label','官方 Codex 登录命令');
  main.append(el('h2','Codex 多账号'),el('p','使用官方 Codex 运行编码会话。新会话可轮询或固定账号；旧会话始终绑定原账号，遇到限流或失效不会自动换号重跑。'),form,accounts,el('p','添加槽位后，可获取官方登录命令。请让 Studio 主机管理员以运行 Studio 的系统身份执行；不要把设备码或令牌粘贴进 Studio。'),command,mode,preferred,save,refresh,status);
  root.replaceChildren(main);
  const labels={chatgpt:'已登录 ChatGPT',other:'非 ChatGPT 登录', 'signed-out':'未登录',unavailable:'无法验证'};
  let disposed=false,busy=false;
  const rpc=(name,data={})=>ctx.rpc.call(name,data);
  const sync=()=>{preferred.hidden=mode.value!=='manual';};mode.onchange=sync;
  async function render(){
    const s=await rpc('settings'); if(disposed)return;
    status.textContent=s.available?'登录状态来自 CLI，不代表订阅额度充足。':'没有找到服务器上的 Codex CLI。请检查插件全局配置中的 CLI 路径。';
    accounts.replaceChildren();preferred.replaceChildren(el('option','请选择账号'));preferred.options[0].value='';
    for(const a of s.accounts){
      const row=el('li',`${a.label} · ${labels[a.status]??'未知'} `); const login=el('button','取登录命令');
      login.onclick=()=>work(async()=>{const r=await rpc('login-command',{id:a.id});if(!disposed){command.value=r.command;command.hidden=false;command.focus();command.select();}});
      row.append(login);accounts.append(row);const option=el('option',a.label);option.value=a.id;preferred.append(option);
    }
    mode.value=s.mode;preferred.value=s.preferred??'';sync();
  }
  async function work(fn){
    if(busy||disposed)return;
    busy=true;main.setAttribute('aria-busy','true');
    try{await fn();}catch{if(!disposed)status.textContent='操作未完成。请检查 CLI 路径、账号别名和权限后重试。';}
    finally{busy=false;if(!disposed)main.removeAttribute('aria-busy');}
  }
  form.onsubmit=e=>{e.preventDefault();void work(async()=>{await rpc('add-account',{label:input.value});input.value='';await render();});};
  save.onclick=()=>work(async()=>{await rpc('save-settings',{mode:mode.value,preferred:preferred.value});await render();});
  refresh.onclick=()=>work(render);void work(render);
  return ()=>{disposed=true;root.replaceChildren();};
}
