import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { createHash } from 'node:crypto'
import { readFile, mkdir, mkdtemp, chmod, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const domains = new Set(['application', 'approval', 'apps', 'attendance', 'base', 'calendar', 'contact', 'docs', 'drive', 'event', 'im', 'mail', 'markdown', 'mindnotes', 'minutes', 'note', 'okr', 'sheets', 'slides', 'task', 'vc', 'whiteboard', 'wiki', 'api', 'schema', 'skills', 'whoami', 'doctor'])
const maxOutput = 1024 * 1024
const releases = {
  'linux-x64': ['linux-amd64', 'cd7363f731c9e5dd2becd909837922cffea8aad229d581a84eb13c6aa0ce6808'],
  'linux-arm64': ['linux-arm64', '166e95ffaec34f82123f50316480250329884c09e71a6f92313047e2c5c3fa5d'],
  'darwin-arm64': ['darwin-arm64', 'd068a27f608335016a8a7fb1b3cd1fccfb96bda92075a027e2bf1c4c23134e30']
}
const execFileAsync = promisify(execFile)

export async function prepareCli(dataDir) {
  if (!dataDir) throw new Error('宿主未提供插件数据目录。')
  const release = releases[`${process.platform}-${process.arch}`]
  if (!release) throw new Error(`暂不支持此平台：${process.platform}-${process.arch}。`)
  const archive = join(dirname(fileURLToPath(import.meta.url)), 'vendor', `lark-cli-1.0.100-${release[0]}.tar.gz`)
  const contents = await readFile(archive)
  if (createHash('sha256').update(contents).digest('hex') !== release[1]) throw new Error('官方发行包 SHA-256 校验失败。')
  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  const temp = await mkdtemp(join(dataDir, '.lark-cli-'))
  try {
    await execFileAsync('tar', ['--no-same-owner', '-xzf', archive, '-C', temp, 'lark-cli'], { timeout: 30000 })
    const target = join(dataDir, 'lark-cli-1.0.100')
    await chmod(join(temp, 'lark-cli'), 0o700)
    await rename(join(temp, 'lark-cli'), target)
    return target
  } finally { await rm(temp, { recursive: true, force: true }) }
}

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
    const stdoutDecoder = new StringDecoder('utf8'), stderrDecoder = new StringDecoder('utf8')
    const stop = reason => { if (!stopped) { stopped = reason; child.kill('SIGKILL') } }
    const collect = (chunk, isError) => {
      size += chunk.length
      if (size > maxOutput) return stop('输出超过 1 MiB，请缩小查询范围或分页。')
      if (isError) stderr += stderrDecoder.write(chunk); else stdout += stdoutDecoder.write(chunk)
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
      stdout += stdoutDecoder.end(); stderr += stderrDecoder.end()
      resolve({ exitCode: code, signal: sig, stdout, stderr })
    })
  })
}

export function apply(ctx) {
  let prepared
  const getExecutable = () => {
    prepared ??= prepareCli(ctx.paths?.dataDir).catch(error => { prepared = undefined; throw error })
    return prepared
  }
  ctx.extensions.rpc.register('check-connection', async (_input, run) => {
    const checks = []
    try {
      const executable = await getExecutable()
      const identity = await executeCli(['whoami'], { signal: run?.signal, executable })
      if (identity.exitCode !== 0) return { ok: false, checks: [{ label: '程序与账号', state: 'error' }], message: '无法读取飞书账号。请检查服务器上的 CLI 配置和授权。' }
      let user
      try { user = JSON.parse(identity.stdout) } catch { return { ok: false, checks: [{ label: '账号状态', state: 'error' }], message: '无法识别 CLI 返回的账号状态。' } }
      checks.push({ label: 'CLI 程序', state: 'ok' })
      const ready = user.available === true && ['ready', 'needs_refresh'].includes(user.tokenStatus)
      checks.push({ label: '账号授权', state: ready ? 'ok' : 'warning' })
      if (!ready) return { ok: false, checks, account: user.onBehalfOf?.userName || '', message: '账号未就绪，请在服务器检查授权。' }
      const result = await executeCli(['calendar', '+agenda'], { signal: run?.signal, executable })
      checks.push({ label: '日历只读请求', state: result.exitCode === 0 ? 'ok' : 'warning' })
      return { ok: result.exitCode === 0, checks, account: user.onBehalfOf?.userName || '', message: result.exitCode === 0 ? '已成功验证飞书日历只读请求。' : '日历请求未通过，请检查网络及日历权限；其他飞书能力可能仍可用。' }
    } catch { return { ok: false, checks: [{ label: 'CLI 程序', state: 'error' }], message: 'CLI 无法启动，请检查服务器平台、文件权限及 tar。' } }
  })
  return ctx.extensions.tools.register({
    name: 'run',
    description: '调用随插件提供的 lark-cli 操作飞书。先用 ["领域", "--help"] 或 ["schema", "服务.资源.方法"] 查询，再传参数数组；不要包含 lark-cli 本身。电子表格：先用 sheets +workbook-info 确认子表和 resource_type；普通 sheet 用 sheets +csv-get、+cells-get，链接的 sheet 参数是子表 ID，传 --sheet-id；--range 必须是 A1 格式（如 A1:B5），不可把 sheet ID 或链接中的 rangeId 当成范围。若选区范围无法确定，询问用户，不要猜测、扩大范围或省略 --range（省略可能读取整表）。resource_type 为 bitable 的子页需使用 base 命令，不可当普通单元格读取。写入前核对用户授权，不得擅自发消息。本工具拒绝显式 --yes，但原生 API 仍可执行写操作，此限制不构成审批。所有 Studio 用户共享服务器操作系统账号的飞书凭据，不按 Studio 用户隔离。',
    readOnly: false,
    inputSchema: { type: 'object', properties: { args: { type: 'array', items: { type: 'string' }, description: '不含程序名的参数数组，例如 ["docs", "--help"]。' } }, required: ['args'] },
    async execute({ args }, run) {
      try {
        const executable = await getExecutable()
        const result = await executeCli(args, { signal: run?.signal, executable })
        return { ok: result.exitCode === 0, content: [result.stdout, result.stderr].filter(Boolean).join('\n') || `进程退出码：${result.exitCode}`, ...(result.exitCode === 0 ? {} : { error: `lark-cli 退出码：${result.exitCode}` }) }
      } catch (error) { return { ok: false, content: `lark-cli 执行失败：${error.message}`, error: error.message } }
    }
  })
}
