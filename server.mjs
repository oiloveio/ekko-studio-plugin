import { spawn } from 'node:child_process'

const domains = new Set(['application', 'approval', 'apps', 'attendance', 'base', 'calendar', 'contact', 'docs', 'drive', 'event', 'im', 'mail', 'markdown', 'mindnotes', 'minutes', 'note', 'okr', 'sheets', 'slides', 'task', 'vc', 'whiteboard', 'wiki', 'api', 'schema', 'skills', 'whoami', 'doctor'])
const maxOutput = 1024 * 1024

export function validate(args) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 100 || args.some(x => typeof x !== 'string' || x.includes('\0') || x.length > 100000)) throw new Error('args 必须是 1–100 个字符串组成的参数数组。')
  if (!domains.has(args[0])) throw new Error('不支持此命令；登录、配置、更新及 profile 管理请在服务器终端执行。')
  if (args.some(x => x === '--yes' || x === '-y' || x.startsWith('--yes='))) throw new Error('插件不支持跳过高风险操作确认；请在服务器终端按 CLI 提示确认。')
}

export function executeCli(args, { signal, executable = 'lark-cli' } = {}) {
  validate(args)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('操作已取消。'))
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':') } })
    let stdout = '', stderr = '', size = 0, stopped = ''
    const stop = reason => { if (!stopped) { stopped = reason; child.kill('SIGKILL') } }
    const collect = (chunk, isError) => {
      size += chunk.length
      if (size > maxOutput) return stop('输出超过 1 MiB，请缩小查询范围或分页。')
      if (isError) stderr += chunk.toString('utf8'); else stdout += chunk.toString('utf8')
    }
    const abort = () => stop('操作已取消。')
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => stop('命令超过 110 秒，已停止。'), 110000)
    child.stdout.on('data', c => collect(c, false))
    child.stderr.on('data', c => collect(c, true))
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error) })
    child.on('close', (code, sig) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      if (stopped) return reject(new Error(stopped))
      resolve({ exitCode: code, signal: sig, stdout, stderr })
    })
  })
}

export function apply(ctx) {
  return ctx.extensions.tools.register({
    name: 'run',
    description: '调用服务器已安装并授权的 lark-cli 操作飞书。先用 ["领域", "--help"] 或 ["schema", "服务.资源.方法"] 查询，再传参数数组；不要包含 lark-cli 本身。优先 +快捷命令。读取文档、表格、消息及用户明确授权的写入均可。写入前核对用户授权，不得擅自发消息。高风险操作需在服务器终端确认，本工具不接受 --yes。所有 Studio 用户共享服务器操作系统账号的飞书凭据，不按 Studio 用户隔离。',
    readOnly: false,
    inputSchema: { type: 'object', properties: { args: { type: 'array', items: { type: 'string' }, description: '不含程序名的参数数组，例如 ["docs", "--help"]。' } }, required: ['args'] },
    async execute({ args }, run) {
      try {
        const result = await executeCli(args, { signal: run?.signal })
        return { ok: result.exitCode === 0, content: [result.stdout, result.stderr].filter(Boolean).join('\n') || `进程退出码：${result.exitCode}`, ...(result.exitCode === 0 ? {} : { error: `lark-cli 退出码：${result.exitCode}` }) }
      } catch (error) { return { ok: false, content: `lark-cli 执行失败：${error.message}`, error: error.message } }
    }
  })
}
