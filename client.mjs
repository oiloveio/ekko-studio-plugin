const KIND = 'lark'
export async function mount(root, ctx) {
  let disposed = false
  const style = document.createElement('style')
  style.textContent = `.connect { max-width: 760px; margin: 0 auto; padding: 24px; font: 14px/1.6 system-ui,sans-serif; color: var(--text-primary, #20252e); } .connect * { box-sizing: border-box; } .connect h2 { margin: 0 0 4px; font-size: 22px; } .connect .sub { opacity:.72; margin: 0 0 20px; } .connect .card { border: 1px solid var(--border-color, #d8dee8); border-radius: 12px; padding: 18px; margin: 12px 0; } .connect h3 { margin: 0 0 10px; font-size: 16px; } .connect .status { font-weight: 650; } .connect .rows { display: grid; gap: 7px; margin: 12px 0; } .connect .row { display:flex; justify-content:space-between; gap:18px; flex-wrap:wrap; } .connect .muted { opacity:.7; } .connect button { cursor:pointer; border:1px solid var(--border-color,#b8c1cf); border-radius:8px; padding:9px 15px; background:var(--accent-color,#356de8); color:white; font:inherit; } .connect button:disabled { opacity:.55; cursor:wait; } .connect code { overflow-wrap:anywhere; } .connect .message { margin-top:10px; white-space:pre-wrap; } .connect ul { margin:8px 0; padding-left:20px; }`
  const wrap = document.createElement('main'); wrap.className = 'connect'
  const h = document.createElement('h2'); h.textContent = KIND === 'lark' ? '飞书连接' : 'Himalaya 邮箱'
  const intro = document.createElement('p'); intro.className='sub'; intro.textContent='查看当前账号、检查连接并了解如何配置。'
  const card = document.createElement('section'); card.className='card'; card.setAttribute('aria-label','连接状态')
  const label=document.createElement('h3'); label.textContent='连接状态'
  const status=document.createElement('div'); status.className='status'; status.setAttribute('role','status'); status.textContent='尚未检查'
  const rows=document.createElement('div'); rows.className='rows'
  const button=document.createElement('button'); button.textContent='检查连接'
  const detail=document.createElement('div'); detail.className='message'; detail.setAttribute('aria-live','polite')
  card.append(label,status,rows,button,detail)
  const guidance=document.createElement('section'); guidance.className='card'
  const gh=document.createElement('h3'); gh.textContent='账号与配置'; guidance.append(gh)
  const note=document.createElement('p'); note.textContent='使用 Studio 进程系统账号已有的 CLI 配置，所有有权调用此插件的用户共享该账号；不按 Studio 用户或 Profile 隔离。'; guidance.append(note)
  const tips=document.createElement('ul')
  const texts=KIND==='lark' ? ['飞书 CLI 随插件提供。请在 Studio 服务器以运行账号完成 CLI 初始化和授权，再返回检查。','检查连接会查询当前身份，并尝试读取主日历；日历权限不足不代表其他飞书能力不可用。','Agent 工具可执行写操作，请仅向可信用户开放，并在写入前确认授权。'] : ['请在 Studio 服务器以运行账号安装并配置 Himalaya 及邮箱认证，再返回检查。','检查连接会读取已配置账号及邮箱文件夹，不读取邮件正文。','当前 Agent 工具仅支持查询、搜索及读取邮件，不支持发送。']
  for(const text of texts){const li=document.createElement('li');li.textContent=text;tips.append(li)} guidance.append(tips)
  const time=document.createElement('p'); time.className='muted';time.textContent='连接状态只代表本次检查结果，不会自动持续更新。';guidance.append(time)
  async function refresh(){button.disabled=true;status.textContent='正在检查…';rows.replaceChildren();detail.textContent='';try{const value=await ctx.rpc.call('check-connection',{});if(disposed)return;status.textContent=value.ok?'已连接':'需要处理';for(const item of value.checks||[]){const row=document.createElement('div');row.className='row';const name=document.createElement('span');name.textContent=item.label;const result=document.createElement('span');result.textContent=item.state==='ok'?'正常':item.state==='warning'?'需关注':'未通过';row.append(name,result);rows.append(row)}detail.textContent=value.message||'';if(value.account){const p=document.createElement('p');p.textContent='当前账号：'+value.account;rows.append(p)}}catch{if(!disposed){status.textContent='检查失败';detail.textContent='无法联系插件，请确认插件已启用后重试。'}}finally{if(!disposed)button.disabled=false}}
  button.onclick=refresh;wrap.append(h,intro,card,guidance);root.append(style,wrap);refresh();return ()=>{disposed=true;wrap.remove();style.remove()}
}
