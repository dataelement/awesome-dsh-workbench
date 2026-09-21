# 目录协议 v1

作者维护的源文件位于 `data/workbenches/owner__repo.yml`，并由 `schema/workbench.schema.json` 严格校验。

作者填写的字段只有：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `url` | 是 | GitHub 仓库主页 |
| `name` | 是 | 展示名称，1–60 个字符 |
| `category` | 是 | `data/categories.json` 中的分类 ID |
| `description.zh` | 是 | 10–200 个字符的中文介绍 |
| `release.url` | 否 | 同一仓库固定版本下的 `.tgz` Release 资源 |
| `release.sha256` | 随 release | 下载文件的 64 位小写 SHA-256 |

分类目前有七个：开发 `development`、效率 `productivity`、内容 `content`、数据 `data`、调研 `research`、运营 `operations`、其他 `other`。

不接受 schema 以外的字段。`dist/catalog.json` 是 CI 生成文件，包含 `id`、`owner`、`repository` 和 `distribution.type` 等派生字段。投稿者不要编辑或提交它。

离线构建只读取仓库内文件，不访问 GitHub、npm 或其他网络服务。目录中没有条目时，仍会生成结构完整的空目录。

`npm run validate` 和 `npm run generate` 属于离线作者检查。`npm run probe` 是受信任环境使用的联网构建，它会补充：

- `workbenchId`、`version` 和截图路径：来自固定 source commit 下的真实 `workbench.json`；
- `sourceCommit` 和许可证：来自 GitHub API；
- `npmPackage`：仅在仓库根 `package.json` 和 npm registry 都明确映射回同一仓库时生成；
- Release 校验结果：校验 SHA-256，并在不执行代码的前提下检查包内清单；
- `probe.status`：成功条目为 `ok`。失败与暂未完成会阻止完整目录产出并在日志中明确区分。

完整构建还会拒绝目录内重复的 `workbenchId`。`dist/catalog.json` 目前只作为 CI artifact 上传，不进行发布或部署。
