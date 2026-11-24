# 上游兼容基线

| 项目 | 基线 | 用途 |
| --- | --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | `codex-cli 0.172.0` | 官方 CLI；插件不分发二进制。当前只在空账号目录实测登录状态，事件与续跑由测试夹具验证。 |
| [Ekko Studio](https://github.com/EKKOLearnAI/ekko-studio) | `0.8.30`，插件 API v1 | UI RPC、独立 Agent、会话和运行路径。当前宿主需要超管完成实际安装。 |
| [ekko-gptfree-pool](https://github.com/qiyuechen0929/ekko-gptfree-pool) | `b595965c6914a70a33839f8ce14f13efc5bbdc54` | 产品与 SDK 架构参考；不打包、不调用，也不随其版本自动更新。 |

检查候选版本时，让旧、新 CLI 分别在独立临时 HOME 跑 `login status`、验证 `exec --json`、`exec resume` 和取消。用 `codex app-server generate-json-schema --experimental` 检查 `account/login/start` 的 `chatgptDeviceCode`、完成通知以及 `account/read` 的身份字段；验证实际设备码取得和取消，不记录设备码。真实授权会话数据在升级前做加密备份；不要把唯一一份真实会话交给未验证的新 CLI。只有通过双账号验收才更新兼容基线。
