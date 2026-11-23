# Ekko Studio 自建插件库

集中管理自用的 Ekko Studio 插件。每个插件都在 `plugins/` 下独立维护，包含自己的插件清单、代码、测试和使用说明。

| 插件 | 能力 | 安装目录 | 当前验证 |
| --- | --- | --- | --- |
| [飞书 CLI](plugins/lark-cli/README.md) | 随附官方 lark-cli v1.0.100；包含读写操作 | `plugins/lark-cli` | 真实日历只读联调及基础测试 |
| [Himalaya 邮箱](plugins/himalaya/README.md) | 查询账号、邮箱、邮件列表，搜索及读取邮件 | `plugins/himalaya` | 真实邮箱文件夹联调及基础测试 |

两个插件均提供 Studio 设置页和只读连接检查。已在当前 Studio 服务器验证飞书日历与邮箱文件夹访问；其他服务器仍需配置与验证，功能受 CLI 版本、账号权限及网络影响。

## 安装到 Studio

本仓库的 `main` 分支集中维护插件源码；Ekko Studio 不会自动扫描子目录。[Studio 官方文档](https://github.com/EKKOLearnAI/ekko-studio/blob/main/docs/plugins.md)支持固定到完整提交的 GitHub 安装源。以下发布提交各自以插件内容为根目录，可分别粘贴到 Studio 的「安装插件」输入框：

```text
飞书 CLI：github:oiloveio/ekko-studio-plugin#0e68fe2368bc50f482d58c36d1772e056e0c3420
Himalaya 邮箱：github:oiloveio/ekko-studio-plugin#7845819d3ba17d0a5600d7ac88c732c6481b8457
```

安装时只复制冒号后的完整 `github:...` 字符串。这些是固定版本；后续更新插件时需要生成并使用新的提交地址。发布分支分别为 `releases/lark-cli` 和 `releases/himalaya`。仓库目前为公开状态；若改为私有，远程固定提交安装能否认证取决于服务器环境，尚未验证。

也可使用服务器本地目录安装：

1. 在运行 Studio 的服务器上检出仓库，例如：

   ```bash
   git clone https://github.com/oiloveio/ekko-studio-plugin.git /实际路径/ekko-studio-plugin
   ```

   `/实际路径/` 是示例，换成服务器上可读写的位置。如果 Studio 运行在容器中，仓库须位于容器可读取的挂载目录；安装时填写容器内路径。

2. 在 Studio「插件中心 → 安装插件」中，分别填写插件所在目录的绝对路径：

   ```text
   /实际路径/ekko-studio-plugin/plugins/lark-cli
   /实际路径/ekko-studio-plugin/plugins/himalaya
   ```

3. 安装并启用需要的插件。新安装的第三方插件默认禁用。安装后刷新 Agent 的 MCP 工具列表或开始新会话。

以上路径仅作格式示例，不是已部署的安装地址。本地目录安装会复制当前文件；更新仓库代码后需要按 Studio 的安装或开发链接机制重新安装或重载。插件本身无需 npm install 或构建。

## 服务器准备与权限

- 飞书插件随附官方 lark-cli v1.0.100，不使用服务器已有的 CLI；需要在 Studio 服务器以对应系统用户配置和授权飞书账号。支持 Linux x86_64 / ARM64 和 macOS ARM64，要求可用的 `tar` 及可执行的插件数据目录。
- 邮箱插件需要在同一环境安装、配置 `himalaya`；本机验证版本为 2.2.1。邮箱插件当前只支持查询和读取，不支持发邮件。
- 两个插件都使用 Studio 进程所属操作系统账号的 CLI 配置与凭据，不会随 Studio 用户或 Profile 自动隔离。只有信任所有可调用插件工具的用户时才启用。
- 飞书插件可执行写入及原生 API 调用；用户授权、飞书权限和 Studio 访问控制需要分别核对。插件拒绝显式 `--yes` / `-y`，但这不构成完整的审批或安全机制。
- CLI 输出可能进入会话记录；插件限制单次输出 1 MiB 和执行时间 110 秒。

## 开发与验证

在对应插件目录运行 `npm test`，分别检查飞书和邮箱插件。测试包括命令参数、取消请求及调用本机 CLI；它们不证明服务器环境、飞书或邮箱账号可用。

## 连接与配置

启用后，在 Studio 设置中分别打开「飞书连接」和「邮箱连接」，检查 CLI、账号和只读业务访问状态。邮箱页可保存当前 Studio 用户和 Profile 的默认账号名称；显式工具参数优先。页面不会保存认证凭据，也不能隔离服务器系统账号中的 CLI 凭据；登录、授权及邮箱连接配置仍需在运行 Studio 的服务器完成。
