# Ekko Studio 飞书 CLI 插件

将服务器已有的 `lark-cli` 暴露为 Studio Agent 工具 `lark-cli__run`。它调用 CLI 本身，覆盖 CLI 的业务领域、快捷命令、原生 API、schema 和内置 Skill 查询；需要单独安装 CLI 并完成授权。使用当前服务器操作系统用户的 CLI 登录态，与 Studio 用户或 Profile 不自动绑定；所有能够调用该工具的 Studio 用户可能使用同一飞书身份。仅在信任所有调用者的环境启用。

## 安装

需要支持插件 SDK v1 的 Ekko Studio，以及服务器上的 Node.js 和已安装、已登录的 `lark-cli`。在插件中心选择本地目录，输入本项目的绝对路径，确认信任后启用。或通过支持此功能的 Studio CLI 执行 `ekko-studio plugins link /绝对路径/ekko-studio-plugin-lark-cli`，再在插件中心启用。安装到远程 Studio 时路径和 CLI 都必须在远程服务器上。无需 npm install 或构建。

安装后刷新 Agent 的 MCP 工具列表或开始新会话。工具使用示例：`{"args":["docs","--help"]}`、`{"args":["schema","drive.file.list"]}`。按照 CLI 帮助选用命令及权限；请求失败应检查退出信息、飞书应用权限和登录态。插件不负责安装 CLI 或登录，认证和配置请在服务器终端完成。

工具可能执行飞书写操作，应仅按用户授权执行；它不代替 Studio 的访问控制。插件拒绝显式的 `--yes` / `-y`，但原生 API 等入口仍可能执行写操作，这项检查不是审批或安全边界。CLI 可能读取或写入服务器文件；不要把工具开放给不可信用户。子进程不经过 shell，最多运行 110 秒，输出上限 1 MiB，超出需缩小范围或分页。处理带有敏感信息的查询时，注意工具输出可能进入会话记录。

## 测试

运行 `npm test`。本地单元测试不代表宿主已成功安装或远程飞书权限已经验证。
