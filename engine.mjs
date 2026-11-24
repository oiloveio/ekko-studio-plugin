import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

export const threadId = x => typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
export async function executable(config) {
  const candidates = [config?.codexPath || resolve(homedir(),'.hermes/bin/codex'), '/usr/local/bin/codex', '/usr/bin/codex'];
  for (const path of config?.codexPath ? candidates.slice(0,1) : candidates) {
    if (typeof path === 'string' && path.startsWith('/')) try { await access(path,constants.X_OK); return path; } catch {}
  }
  throw Error('找不到 Codex CLI；请设置服务器上的可执行文件绝对路径。');
}
export function engineEnvironment(home) {
  // Do not forward Studio/API credentials or API base-URL overrides.
  const env = { CODEX_HOME:home, HOME:home, XDG_CONFIG_HOME:home, XDG_DATA_HOME:home, XDG_CACHE_HOME:home, NO_COLOR:'1' };
  for (const key of ['PATH','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR']) if (process.env[key]) env[key]=process.env[key];
  return env;
}
export function argsFor({ thread, images = [] }) {
  const flags = ['--json','--ignore-user-config','--skip-git-repo-check','-c','cli_auth_credentials_store="file"','-c','approval_policy="never"','-c','sandbox_mode="workspace-write"','-c','shell_environment_policy.inherit="none"','-c','sandbox_workspace_write.network_access=false','--disable','hooks'];
  for (const image of images) flags.push('--image',image);
  if (thread !== undefined) {
    if (!threadId(thread)) throw Error('Codex 会话标识无效。');
    return ['exec','resume',...flags,thread,'-'];
  }
  return ['exec',...flags,'-'];
}
export async function cli(path,args,{ cwd,home,signal,prompt='',onEvent, timeout=10000 }) {
  if (signal?.aborted) throw Error('Codex 操作已取消。');
  const child=spawn(path,args,{cwd,env:engineEnvironment(home),stdio:['pipe','pipe','pipe'],detached:true});
  let killed=false, force, stdout='', stderr='', protocolError=false, handlerError, total=0;
  function terminate(){
    if (killed) return;
    killed=true;
    try { process.kill(-child.pid,'SIGTERM'); } catch {}
    force=setTimeout(()=>{ try { process.kill(-child.pid,'SIGKILL'); } catch {} },1000); force.unref();
  }
  const timer=setTimeout(terminate,timeout); timer.unref();
  signal?.addEventListener('abort',terminate,{once:true});
  if (signal?.aborted) terminate();
  child.stdin.on('error',()=>{}); child.stdin.end(prompt);
  // Never forward stderr: it can contain paths, account metadata or prompts.
  child.stderr.on('data',data=>{if(!onEvent && stderr.length<4096) stderr+=data.toString('utf8').slice(0,4096-stderr.length);});
  child.stdout.on('data',data=>{ total+=data.length; if (total>8*1024*1024) terminate(); });
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  const closed=new Promise(resolve=>{ child.once('error',()=>resolve(null)); child.once('close',resolve); });
  try {
    for await (const line of lines) {
      if (killed) continue;
      if (!onEvent) { if (stdout.length + line.length < 8192) stdout+=line+'\n'; continue; }
      let event;
      try { event=JSON.parse(line); } catch { protocolError=true; terminate(); continue; }
      try { await onEvent(event); } catch(e) { handlerError=e; terminate(); }
    }
    const code=await closed;
    if (handlerError) throw handlerError;
    if (protocolError) throw Error('Codex CLI 返回了无法解析的事件。');
    if (killed) throw Error('Codex 已取消、超时或超过输出上限；不会自动换账号重试。');
    return {code,stdout,stderr};
  } finally { lines.close(); clearTimeout(timer); if (!killed) clearTimeout(force); signal?.removeEventListener('abort',terminate); }
}
export async function loginState(path,home,signal) {
  try {
    const result=await cli(path,['login','-c','cli_auth_credentials_store="file"','status'],{cwd:home,home,signal});
    const text=result.stdout+'\n'+result.stderr;
    if (result.code===0 && /^Logged in using ChatGPT(?:\s*\([^\r\n]*\))?\s*$/mi.test(text)) return 'chatgpt';
    if (result.code===0) return 'other';
    if (/not logged in/i.test(text)) return 'signed-out';
    return 'unavailable';
  } catch { return 'unavailable'; }
}
