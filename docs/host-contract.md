# 宿主契约来源

本次核对的工作台实现来自 **尚未合并的 Desktop PR #429**，commit `9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9`，不是 Desktop main 或正式发布承诺：

- [包校验脚本](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/scripts/check-workbench-package.mjs)：manifest v1、ID、版本、entry、compatibility、capabilities、bundle patch 和客户端服务注入。
- [包与截图体积上限](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/packages/dsh-desktop-workbenches/submissions.mjs)：包 8 MiB、单图 2 MiB。
- [作者指南](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/packages/dsh-desktop-workbenches/development-guide.zh.md)：安装及会话行为参考。

旧官网 `/workbench/skills/workbench-development/SKILL.md` 在本次核对时返回官网 HTML，不再作为可用的唯一规范入口。若以后恢复公开指南，应检查正文和内容类型，不能只检查 HTTP 200。

目录 YAML 不是运行时 manifest，也不是本机投稿 API。目录只规定市场元数据；不会新增宿主 API 或要求把 YAML 当作插件包。实际 SDK 以目标宿主版本为准，投稿者必须记录本机安装和使用结果。

## 与开发中指南的差异

本目录沿用“首次收录、后续作者自行发版”的流程，安装采用 npm → Release → 源码优先级。市场截图声明集中到目录 YAML，宿主自身图片字段不作为市场回退来源。宿主投稿材料应使用含 url、name、category、description（zh/en）、screenshots 及可选 tarball 的 example；消费者必须使用生成目录中的精确包版本/下载地址/校验值或源码 commit，不能在安装时重新解析 latest。

v1 保留一个仓库一个根目录工作台的限制。monorepo 留待消费者协议明确后扩展；生成目录的 npm 安装来源仍需 Desktop 客户端联调验收。

图片完整解码使用 sharp（Node 端 libvips），只用于维护工具和 CI，不进入 Desktop 包。现有 YAML/JSON 工具不能验证损坏图片或解压像素上限，因此增加该依赖；CI 在 Node 22 Ubuntu 上验证，其他本地平台需有 sharp 对应的预构建依赖。SemVer 用 semver 校验，避免自行维护不完整的版本正则。
