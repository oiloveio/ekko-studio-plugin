# 上游更新与发布

## 更新原则

插件代码在本仓库独立维护，不直接覆盖或自动运行上游代码。`upstream-versions.json` 记录已验证的基线：飞书是随插件打包的固定版；Himalaya 是最后验证版本（用户须自行安装）；Studio 是已验证过 API 的版本，不能解读为所有页面及平台兼容。每周一的 Actions 工作流和手动运行 `node scripts/check-upstream.mjs` 会检查三个项目的最新正式 release；发现较新版本退出码为 2，网络、限流、非标准版本等检查失败为 1，正常为 0。请在 GitHub Actions 查看失败记录，通知是否发送取决于仓库及用户的 GitHub 通知设置；工作流不会创建 issue、自动更新或发布。GitHub 可能停用长期不活跃仓库的计划任务，需定期检查。上游没有 release 或只用 prerelease 的变化需人工关注。

## 评估更新

1. 阅读上游 release notes、CLI 帮助及 Studio SDK 字段契约，识别破坏性变化，并记录受影响插件、系统架构和回滚方案。
2. 飞书：从官方 release 下载支持的三个发行包和官方校验清单，验证 SHA-256 后再替换 `vendor/`；同时更新 `server.mjs` 中版本、各平台摘要、解包文件名和 README。不要仅相信下载渠道或自行生成的摘要；官方清单无法核验时停止。
3. Himalaya：在隔离环境安装目标版本，检查 JSON 输出、命令参数、认证、分页及读取是否标记已读；插件本身不负责安装 CLI。
4. Studio：在对应版本的隔离实例验证安装、设置页、RPC、工具、升级、重载与旧配置。当前仅 API 实际联调，页面验收还未完成。
5. 本地运行 `node --test test/*.test.mjs` 和两个插件目录的 `npm test`，检查 CI；用测试账号完成只读联调，记录确切版本、结果与未覆盖项。修改 `upstream-versions.json` 中的基线应以验证为前提，不是仅以发现新版本为依据。

## 发布和回滚

每个插件独立以其目录树作为安装包根目录；主分支不是可直接安装的单插件包。先更新插件的 `plugin.json` 与 `package.json` 为相同的新版本，合并到远程 main 并确认 CI。然后在干净、与远程 main 同步的检出中执行：

```sh
scripts/prepare-release.sh lark-cli          # 仅检查
scripts/prepare-release.sh lark-cli --push   # 创建基于当前发布分支的提交并推送
scripts/prepare-release.sh himalaya          # 邮箱插件同理
```

脚本以当前发布分支作为父提交，普通 push 在远程分支变化时会拒绝覆盖；不会运行强制推送。发布后使用输出的完整提交更新根 README 的安装地址并提交，再从该固定地址在隔离 Studio 实际安装、验证页面和只读调用。若安装失败，保留现有安装；在 Studio 选择已知可用的旧固定提交重新安装或使用宿主回滚，验证后再恢复。飞书远程安装之前出现过失败，因此不能只凭分支推送成功宣布安装验证完成。上线过程中不要记录密钥、令牌或邮件正文。
