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

不接受 schema 以外的字段。`dist/catalog.json` 是生成文件，包含 `id`、`owner`、`repository` 和 `distribution.type` 等派生字段。请勿手工编辑。

构建过程只读取仓库内文件，不访问 GitHub、npm 或其他网络服务。目录中没有条目时，仍会生成结构完整的空目录。
