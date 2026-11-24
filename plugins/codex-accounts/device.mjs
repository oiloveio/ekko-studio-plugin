import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { engineEnvironment } from './engine.mjs';

const verificationUrl='https://auth.openai.com/codex/device';
export function deviceLogin(bin,home,{signal,onCode,timeout=15*60*1000}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('授权已取消。'));return;}
    const child=spawn(bin,['app-server','--listen','stdio://','-c','cli_auth_credentials_store="file"'],{
      cwd:home,env:engineEnvironment(home),stdio:['pipe','pipe','ignore'],
    });
    const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
    let loginId, outcome, error, stopped=false, total=0, force;
    const send=msg=>child.stdin.write(JSON.stringify(msg)+'\n');
    function stop(err) {
      if(stopped)return;
      stopped=true;error=err;child.stdin.end();child.kill('SIGTERM');
      force=setTimeout(()=>child.kill('SIGKILL'),1500);force.unref();
    }
    const abort=()=>stop(Error('授权已取消。'));
    const startTimer=setTimeout(()=>stop(Error('未能取得授权码，请检查服务器到 OpenAI 的网络。')),25000);startTimer.unref();
    const expiry=setTimeout(()=>stop(Error('授权已超时，请重新发起。')),timeout);expiry.unref();
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.stdin.on('error',()=>stop(Error('Codex 授权进程无法通信。')));
    child.on('error',()=>stop(Error('无法启动官方 Codex 授权进程。')));
    child.stdout.on('data',buf=>{total+=buf.length;if(total>1024*1024)stop(Error('Codex 授权响应超出限制。'));});
    lines.on('line',line=>{
      if(stopped)return;
      let msg;try{msg=JSON.parse(line);}catch{return;}
      if(!msg || typeof msg!=='object')return;
      if(msg.id===1){
        if(!msg.result)return stop(Error('当前 Codex CLI 不支持页面授权，请检查版本。'));
        send({method:'initialized'});
        send({id:2,method:'account/login/start',params:{type:'chatgptDeviceCode'}});
      }else if(msg.id===2){
        const r=msg.result;
        if(!r || r.type!=='chatgptDeviceCode' || r.verificationUrl!==verificationUrl || !/^[A-Z0-9-]{4,32}$/i.test(r.userCode??'') || typeof r.loginId!=='string')
          return stop(Error('未能取得官方授权码。请检查服务器网络及 Codex CLI 版本。'));
        clearTimeout(startTimer);loginId=r.loginId;onCode({url:verificationUrl,code:r.userCode});
      }else if(msg.method==='account/login/completed' && loginId && msg.params?.loginId===loginId){
        if(msg.params.success!==true)return stop(Error('OpenAI 未完成授权；请检查设备码登录设置后重试。'));
        send({id:3,method:'account/read',params:{refreshToken:false}});
      }else if(msg.id===3){
        const {account,userId,workspaceRouting}=msg.result??{};
        if(account?.type!=='chatgpt' || typeof userId!=='string' || !userId)return stop(Error('无法确认已授权的 ChatGPT 账号；原绑定未更改。'));
        outcome={userId,workspaceId:workspaceRouting?.chatgptAccountId??null,plan:typeof account.planType==='string'?account.planType:null};stop();
      }
    });
    child.once('close',()=>{
      lines.close();clearTimeout(startTimer);clearTimeout(expiry);clearTimeout(force);signal?.removeEventListener('abort',abort);
      if(error||!outcome)reject(error??Error('Codex 授权进程提前结束。'));else resolve(outcome);
    });
    if(!stopped)send({id:1,method:'initialize',params:{clientInfo:{name:'ekko-codex-accounts',version:'0.2.0'},capabilities:{experimentalApi:true}}});
  });
}
