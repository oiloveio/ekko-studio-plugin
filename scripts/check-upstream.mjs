import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function compareVersions(latest, baseline) {
  const parse = tag => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag); if (!m) throw new Error(`无法比较非稳定版本：${tag}`); return m.slice(1).map(Number) }
  const a = parse(latest), b = parse(baseline)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return 0
}
export async function checkUpstreams(config, request = fetch) {
  const results = []
  for (const [name, item] of Object.entries(config)) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(item.repository)) throw new Error(`无效的仓库名称：${name}`)
    const response = await request(`https://api.github.com/repos/${item.repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ekko-plugin-upstream-check', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }, signal: AbortSignal.timeout(20000)
    })
    if (!response.ok) throw new Error(`${name}: GitHub API HTTP ${response.status}`)
    const release = await response.json()
    if (release.draft || release.prerelease || typeof release.tag_name !== 'string') throw new Error(`${name}: 上游返回了非正式版本`)
    results.push({ name, repository: item.repository, baseline: item.baseline, latest: release.tag_name, update: compareVersions(release.tag_name, item.baseline) > 0 })
  }
  return results
}
async function main() {
  const config = JSON.parse(await readFile(new URL('../upstream-versions.json', import.meta.url), 'utf8'))
  const results = await checkUpstreams(config)
  for (const r of results) console.log(`${r.name}: 当前基线 ${r.baseline}，上游 ${r.latest}${r.update ? '（有新版本，需评估）' : ''} https://github.com/${r.repository}/releases/latest`)
  if (results.some(r => r.update)) { console.error('发现上游更新，请按 docs/maintenance.md 评估；不会自动升级。'); process.exitCode = 2 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(`上游检查失败：${error.message}`); process.exitCode = 1 })
