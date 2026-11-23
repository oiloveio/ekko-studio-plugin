import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

export function buildArgs(input) {
  const { action, account, mailbox, page = 1, pageSize = 25, query, id } = input
  const routes = { accounts:['account','list'], mailboxes:['mailbox','list'], list:['envelope','list'], search:['envelope','search'], read:['message','read'] }
  if (!Object.hasOwn(routes, action)) throw new Error('不支持的操作。')
  const args = ['--json', ...routes[action]]
  function value(s, name) { if (typeof s !== 'string' || !s.trim() || s.startsWith('-') || s.includes('\0') || s.length > 1024) throw new Error(`${name} 无效。`); return s }
  if (account) args.push('--account', value(account, 'account'))
  if (mailbox && ['list','search','read'].includes(action)) args.push('--mailbox', value(mailbox, 'mailbox'))
  if (['list','search'].includes(action)) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('页码或每页数量无效。')
    args.push('--page', String(page), '--page-size', String(pageSize))
  }
  if (action === 'search') args.push('--', value(query, 'query'))
  if (action === 'read') args.push('--', value(id, 'id'))
  return args
}

export function invoke(args, signal, executable = 'himalaya') {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(new Error('请求已取消'))
    const child = spawn(executable,args,{shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin'].filter(Boolean).join(':')}})
    let out='', err='', bytes=0, reason=''
    const outDecoder=new StringDecoder('utf8'), errDecoder=new StringDecoder('utf8')
    const stop = s => { if (!reason) {reason=s; child.kill('SIGKILL')} }
    const receive = (c, error) => {bytes+=c.length;if(bytes>1048576) return stop('输出超过 1 MiB，请缩小范围。'); if(error) err+=errDecoder.write(c); else out+=outDecoder.write(c)}
    const abort=()=>stop('请求已取消'); signal?.addEventListener('abort',abort,{once:true})
    const timer=setTimeout(()=>stop('命令超过 110 秒。'),110000)
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
    child.stdout.on('data',c=>receive(c,false));child.stderr.on('data',c=>receive(c,true))
    child.on('error',e=>{cleanup();reject(e)}); child.on('close',code=>{cleanup();if(reason) reject(new Error(reason));else {out+=outDecoder.end();err+=errDecoder.end();resolve({code,out,err})}})
  })
}

export function apply(ctx) {
  const userSettings = run => run.state.plugin.namespace('users', String(run.identity.userId)).namespace('profiles', String(run.identity.profile))
  ctx.extensions.rpc.register('get-settings', async (_input, run) => await userSettings(run).get('preferences') ?? { account: '' })
  ctx.extensions.rpc.register('save-settings', async (input, run) => {
    const account = input?.account
    if (typeof account !== 'string' || account.length > 128 || (account && (!account.trim() || account.startsWith('-') || account.includes('\0')))) throw new Error('邮箱账号名称无效。')
    await userSettings(run).set('preferences', { account })
    return { ok: true }
  })
  ctx.extensions.rpc.register('check-connection', async (_input, run) => {
    const checks = []
    try {
      const version = await invoke(['--version'], run?.signal)
      if (version.code !== 0) throw new Error('version')
      checks.push({ label: 'Himalaya 程序', state: 'ok' })
      const result = await invoke(buildArgs({ action: 'accounts' }), run?.signal)
      if (result.code !== 0) return { ok: false, checks: [...checks, { label: '账号配置', state: 'error' }], message: '无法读取邮箱账号配置，请检查服务器上的 Himalaya 配置。' }
      let accounts
      try { accounts = JSON.parse(result.out).accounts } catch { accounts = null }
      const selected = (await userSettings(run).get('preferences'))?.account
      const account = Array.isArray(accounts) && (selected ? accounts.find(a => a.name === selected) : accounts.find(a => a.default) || accounts[0])
      if (!account?.name) return { ok: false, checks: [...checks, { label: '账号配置', state: 'error' }], message: '尚未找到已配置的邮箱账号。' }
      checks.push({ label: '账号配置', state: 'ok' })
      const boxes = await invoke(buildArgs({ action: 'mailboxes', account: account.name }), run?.signal)
      checks.push({ label: '邮箱文件夹访问', state: boxes.code === 0 ? 'ok' : 'error' })
      return { ok: boxes.code === 0, checks, account: account.name, message: boxes.code === 0 ? '已成功读取邮箱文件夹列表。' : '无法读取邮箱文件夹，请检查邮箱认证及网络。' }
    } catch { return { ok: false, checks: [{ label: 'Himalaya 程序', state: 'error' }], message: '无法启动 Himalaya，请在 Studio 服务器安装并配置它。' } }
  })
  return ctx.extensions.tools.register({name:'mail',description:'使用服务器上已配置的 Himalaya 查询邮箱：accounts、mailboxes、list、search、read。search 使用 Himalaya 查询语法，如 subject 发票。read 默认不标记已读。仅按用户授权访问；服务器系统账号的邮箱凭据由所有有权调用该工具的 Studio 用户共享。',readOnly:true,inputSchema:{type:'object',properties:{action:{type:'string',enum:['accounts','mailboxes','list','search','read']},account:{type:'string'},mailbox:{type:'string'},page:{type:'integer'},pageSize:{type:'integer'},query:{type:'string'},id:{type:'string'}},required:['action']},async execute(input,run){try{const preferred = input.action !== 'accounts' && !input.account ? (await userSettings(run).get('preferences'))?.account : '';const r=await invoke(buildArgs(preferred ? {...input, account: preferred} : input),run?.signal);return {ok:r.code===0,content:[r.out,r.err].filter(Boolean).join('\n') || `退出码 ${r.code}`,...(r.code===0?{}:{error:`Himalaya 退出码 ${r.code}`})}}catch(e){return {ok:false,content:`Himalaya 调用失败：${e.message}`,error:e.message}}}})
}
