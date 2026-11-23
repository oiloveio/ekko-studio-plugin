# Ekko Studio 自建插件库

这里集中管理自用的 Ekko Studio 插件。每个插件都是 `plugins/` 下的独立目录，有自己的清单、代码和说明。

| 插件 | 用途 | 目录 |
| --- | --- | --- |
| 飞书 CLI | 调用服务器已授权的 lark-cli 操作飞书 | [plugins/lark-cli](plugins/lark-cli/README.md) |
| Himalaya 邮箱 | 查询邮箱、搜索和读取邮件 | [plugins/himalaya](plugins/himalaya/README.md) |

## 安装

本仓库是私有仓库，当前作为插件源码和说明的集中目录。Ekko Studio 的普通 GitHub 地址安装只支持公开仓库的根目录，不会扫描这里的 `plugins/` 并把它们显示为插件市场。

保持仓库私有时，先将需要的插件目录放到 Studio 服务器可访问的位置，再在「插件中心 → 安装插件」中分别填写对应插件目录的服务器绝对路径。每个目录都包含独立的 `plugin.json`、`package.json` 和 JavaScript 入口。实际路径取决于部署和容器挂载；本仓库尚未在目标服务器验证安装。

两个插件分别依赖服务器上的 `lark-cli` 和 `himalaya` 及对应的登录配置，不随插件安装。它们使用 Studio 进程所在操作系统账号的凭据，不会按 Studio 用户自动隔离。详情及已验证范围见各插件说明。
