#!/usr/bin/env bash
set -euo pipefail
usage='用法: scripts/prepare-release.sh {lark-cli|himalaya} [--push]'
plugin=${1:-}
case "$plugin" in lark-cli|himalaya) ;; *) echo "$usage" >&2; exit 1;; esac
case "${2:-}" in ''|--push) ;; *) echo "$usage" >&2; exit 1;; esac
if [ "$(git rev-parse --show-toplevel)" != "$PWD" ]; then echo '请在仓库根目录执行。' >&2; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo '工作区不干净，请先提交或处理所有修改。' >&2; exit 1; fi
if [ "$(git branch --show-current)" != main ]; then echo '请在 main 分支执行。' >&2; exit 1; fi
node -e 'const fs=require("fs"); const p=process.argv[1];const a=JSON.parse(fs.readFileSync(`plugins/${p}/plugin.json`));const b=JSON.parse(fs.readFileSync(`plugins/${p}/package.json`));if(a.version!==b.version)throw Error("两个清单版本不一致")' "$plugin"
git fetch --no-tags origin "refs/heads/releases/$plugin"
old=$(git rev-parse FETCH_HEAD)
git fetch --no-tags origin refs/heads/main
remote_main=$(git rev-parse FETCH_HEAD)
if [ "$(git rev-parse HEAD)" != "$remote_main" ]; then echo '本地 main 与远程 main 不一致，请先同步。' >&2; exit 1; fi
tree=$(git rev-parse "HEAD:plugins/$plugin")
old_tree=$(git rev-parse "$old^{tree}")
if [ "$tree" = "$old_tree" ]; then echo '插件内容没有变化，无需发布。'; exit 0; fi
printf '插件：%s\n当前发布提交：%s\n待发布的目录树：%s\n' "$plugin" "$old" "$tree"
if [ "${2:-}" != --push ]; then echo '仅检查；确认测试通过后加 --push 发布。'; exit 0; fi
commit=$(printf 'Release %s from main %s\n' "$plugin" "$remote_main" | git commit-tree "$tree" -p "$old")
git push origin "$commit:refs/heads/releases/$plugin"
printf '新安装源：github:oiloveio/ekko-studio-plugin#%s\n请更新 README 中的安装源并提交。\n' "$commit"
