# Awesome DSH Workbench

DSH Desktop 工作台市场的公开目录。作者保管自己的源码和发布包；本仓库只保存一份简短的仓库索引，并生成给客户端读取的 `dist/catalog.json`。

## 目录怎样工作

- 一个源码仓库对应 `data/workbenches/<owner>__<repo>.yml`。
- 第一次上架或修改展示信息，通过 GitHub Pull Request 提交这个 YAML。
- 作者以后发布新版本，无需为每个版本改目录文件。后续版本探测属于下一阶段，不在本仓库联网执行。
- 本仓库不复制和托管作者的安装包。

当前安装来源按 DSH Market 的思路保留仓库地址。作者可以额外写明一个不可变的 GitHub Release `.tgz` 地址和 SHA-256；没有填写时，生成目录会标记为 GitHub 源码来源。npm 和版本探测将在后续联网任务中补充。

## 投稿

阅读 [投稿指南](CONTRIBUTING.md)，复制 [YAML 示例](examples/workbench.yml)，每次只修改一个 `data/workbenches/owner__repo.yml`，并提交脚本生成的 `dist/catalog.json`。合并代表进入公开目录，不代表 DSH 团队接管工作台源码或后续维护。

## 本地检查

```bash
npm ci
npm run check
```

`npm run generate` 会重新生成 `dist/catalog.json`。生成结果按仓库 ID 排序且不含时间戳，相同输入始终得到相同文件。

字段说明见 [目录协议](catalog/README.md)，审核标准见 [验收清单](docs/review-checklist.md)。
