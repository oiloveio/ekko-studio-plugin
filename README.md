# Codex 多账号 · Ekko Studio

用官方 Codex CLI 处理正常的编码会话。不是图片代理，也不将 ChatGPT 订阅转成公共 API。支持新会话轮询或固定一个首选账号；已有会话绑定原账号槽位与原 Codex 线程，支持进程重启后续跑。不接管 Studio 内置 Codex Agent。

## 安装与登录

1. 在 Studio 超级管理员会话打开「插件中心 → 安装插件」，填入插件根目录绝对路径，例如 `/home/agent/.hermes/plugin-development/codex-accounts`。也可填写以此目录为根的发布提交 `github:oiloveio/ekko-studio-plugin#<40位提交>`。确认信任后启用。
2. 在目标 Studio **服务器/容器**部署官方 Codex CLI。基线为 Studio 0.8.30、Codex CLI 0.172.0、Linux；若没有自动找到 CLI，在插件全局配置填其绝对路径。不要填客户端电脑的路径。
3. 从侧栏或 Agent 设置的「Codex 多账号」添加账号别名，点击「取登录命令」，在 Studio 环境用**同一个系统用户**执行命令并在官方界面完成设备授权。若账号未启用设备码登录，需在官方设置开启；不要发送密码、TOTP、设备码或令牌给助手。每个槽位单独登录、刷新状态。只在同一槽位重新登录**原来的 ChatGPT 账号**；插件只检查 CLI 的登录类型，不核验邮箱/订阅主体，不同账号请新建槽位。
4. 新建普通 Studio 私聊并选择 `Codex 多账号`，模式为全局，模型选 `Codex 默认模型`。选择一个独立项目目录作为工作区（不要用包含插件数据/凭据的上级目录）。默认轮询；若选「固定给新会话」，应选择已完成登录的槽位。旧会话不受新策略影响。

## 行为和安全边界

- 轮询基于官方 `codex login status`，不预测额度或健康，不因限流而在同一会话换号或重放。登录状态成功只表示 CLI 报告通过 ChatGPT 登录。文本按 CLI 已完成的消息事件逐条显示，不是逐 token。
- 运行使用 `codex exec`/`codex exec resume`，固定在项目目录使用 workspace-write 沙箱、安全审批策略不升级权限、关闭沙箱网络和 Codex hooks；不继承 Studio 的 API 密钥或自定义 API 基址。不支持 Studio 群聊、工作流或远程 API 表面。CLI stderr 不返回浏览器；失败时给通用提示。没有接入自动提交、自动发布或模型端额度探测。
- 每个 Studio 用户/Profile 有隔离槽位路径，账号凭据由官方 CLI 存到私有 `CODEX_HOME`，插件不提取令牌。**Unix 文件权限和 Studio 路由隔离不是不可信租户之间的安全边界**：CLI 和 Studio 仍是同一系统用户，沙箱可允许读取工作区外的文件。仅用于单人或完全受信环境；互不信任用户须用不同操作系统身份或隔离宿主。不得将数据目录提交到 Git、放入普通项目或公开共享。
- 同一个 Studio 宿主进程内串行分配新会话，并拒绝同一会话并发执行；不支持多副本共同写同一份状态数据。启停会保留账号槽位和会话映射；备份必须按凭据级别保护。代码通过官方 CLI，不继承参考号池的密码/TOTP 登录、私有代理或自动故障重放。

## 验证、发布与升级

- `npm test` 跑隔离测试。追加 `TEST_CODEX_BINARY=/path/to/codex npm test` 在新建、不含账号的临时目录验证真实 CLI 的未登录状态。测试不会使用已有凭据或发送模型请求。
- 维护时对照 [参考插件](https://github.com/qiyuechen0929/ekko-gptfree-pool) 的页面/独立 Agent 架构，不直接复制其认证实现。升级检查 [OpenAI Codex CLI](https://github.com/openai/codex) 的 `login status`、`exec --json` 事件、`exec resume` 参数/行为，以及 Studio 的 Agent SDK；查看 `UPSTREAM.md` 中的基线。通过隔离环境测试后再更新发布提交，不自动修改运行时。
- 正式验收：管理员从固定提交安装、启用并核实入口加载；用两个授权的订阅分别做新的真实编码会话，核对分配；重启后续跑第一会话；登出其原账号后确认不会切到第二账号；核对取消或失败后没有第二次生成。CI、宿主安装和真实生成各自记录，不互相替代。
