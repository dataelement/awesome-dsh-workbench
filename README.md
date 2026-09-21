# Awesome DSH Workbench

DSH Desktop 工作台市场的公开目录。作者保管自己的源码和发布包；本仓库只保存一份简短的仓库索引，并生成给客户端读取的 `dist/catalog.json`。

## 目录怎样工作

- 一个源码仓库对应 `data/workbenches/<owner>__<repo>.yml`。
- 第一次上架或修改展示信息，通过 GitHub Pull Request 提交这个 YAML。
- 作者以后发布新版本，无需为每个版本改目录文件。后续版本探测属于下一阶段，不在本仓库联网执行。
- 本仓库不复制和托管作者的安装包。

当前安装来源按 DSH Market 的思路保留仓库地址。作者可以额外写明一个不可变的 GitHub Release `.tgz` 地址和 SHA-256；没有填写时，生成目录会标记为 GitHub 源码来源。联网构建会按安全规则发现 npm 包和版本。

受信任构建会联网确认仓库公开、未归档且有可识别许可证，并读取真实的 `workbench.json`。只有仓库根 `package.json` 明确给出包名、且 npm 元数据反向指向同一个 GitHub 仓库时才采用 npm；系统不会根据仓库名猜包名。固定 Release 包会在大小限制内解包读取清单，不执行其中代码。

## 投稿

阅读 [投稿指南](CONTRIBUTING.md)，复制 [YAML 示例](examples/workbench.yml)，每次只提交一个 `data/workbenches/owner__repo.yml`。`dist/catalog.json` 由 CI 生成，投稿者不要修改或提交。合并代表进入公开目录，不代表 DSH 团队接管工作台源码或后续维护。

## 本地检查

```bash
npm ci
npm run check
```

`npm run check` 会在本机重新生成 `dist/catalog.json` 供检查，但投稿时不要提交它。生成结果按仓库 ID 排序且不含时间戳，相同输入始终得到相同文件。

字段说明见 [目录协议](catalog/README.md)，审核标准见 [验收清单](docs/review-checklist.md)。

## 自动化边界

- 投稿 PR 的普通工作流不检出也不执行贡献者代码。
- `workflow_run` 门禁始终检出 `main` 上的受信任脚本，只通过 GitHub API 读取 PR 中唯一的候选 YAML。远程服务限流或临时不可用会标为“探测未完成”，内容或安全检查失败会使门禁失败。
- `main` 分支构建会执行完整探测并上传 `dist/catalog.json` 为 Actions artifact。目前没有发布或部署步骤。

`workflow_run` 门禁必须先随本实现合并到 `main` 才会生效；本次引导 PR 本身不能依靠尚未存在于 `main` 的门禁。
