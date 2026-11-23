# Himalaya 邮箱插件

通过服务器已配置的 Himalaya CLI 查询账号、邮箱、邮件列表、搜索和读取正文。当前适配 Himalaya 2.2.1；只读操作不发送邮件。读取默认不标记已读。安装与配置 Himalaya、邮箱认证需要在 Studio 服务器单独完成；本插件不包含 CLI 或凭据。

本目录为独立插件包，包含 plugin.json 与可直接执行的 JavaScript 入口。私有仓库需要将本目录放到 Studio 服务器后，以该目录的服务器绝对路径安装；普通公开 GitHub 链接不能直接安装本私有子目录。项目依赖 Studio 插件 SDK v1 与 Node.js，且系统 PATH 须能找到 himalaya。

插件使用 Studio 进程运行账号的 Himalaya 配置和邮箱凭据，不按 Studio 账号或 Profile 隔离。只有信任所有能够调用工具的用户时才启用，邮件内容可能进入对话记录。

工具示例：`{"action":"list","pageSize":20}`、`{"action":"search","query":"subject 发票"}`、`{"action":"read","id":"42"}`。实际搜索语法、ID 和认证能力取决于服务器 CLI 和邮箱后端。当前未验证服务器安装、登录或真实邮箱访问。
