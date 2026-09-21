# 工作台市场投稿指南

投稿前，请先按 [DSH Desktop 工作台开发指南](https://dshdesktop.com/workbench/skills/workbench-development/SKILL.md) 在本机安装、打开并验证工作台。源码和发布包继续由作者维护。

## 第一次投稿

1. Fork 本仓库并创建分支。
2. 复制 `examples/workbench.yml` 到 `data/workbenches/<GitHub owner>__<仓库名>.yml`。
3. 填写真实内容。文件中的 `url` 必须和文件名指向同一个公开 GitHub 仓库。
4. 运行 `npm ci && npm run check`。检查会在本机生成 `dist/catalog.json`，不要把它加入提交。
5. 发起 Pull Request。投稿 PR 只能新增或修改这一份 YAML，方便审核范围保持清楚。

例如 `https://github.com/acme/data-helper` 对应 `data/workbenches/acme__data-helper.yml`。

```yaml
url: https://github.com/acme/data-helper
name: 数据助手
category: data
description:
  zh: 帮助团队整理、检查并解释日常业务数据。
```

## 可选的 GitHub Release 安装包

如果已经发布稳定的 `.tgz`，可以增加：

```yaml
release:
  url: https://github.com/acme/data-helper/releases/download/v1.0.0/workbench.tgz
  sha256: 64位小写SHA-256
```

地址必须指向同一仓库的固定 Release 版本，不能使用 `latest` 或会变化的下载地址。不要提交安装包、密钥、邮箱或业务数据。

## 后续版本

发布新版本时继续在自己的仓库发布。本阶段不要求每个版本再提目录 PR。若名称、分类、中文介绍或固定 Release 包发生变化，可以修改原来的 YAML 并提交 PR。

机器人生成的 `id`、仓库 owner/name、安装来源类型等字段不要写进 YAML，它们由构建脚本从仓库地址和文件内容计算。
