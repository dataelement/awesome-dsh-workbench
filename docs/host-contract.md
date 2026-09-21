# 宿主契约来源

本次核对的工作台实现来自 **尚未合并的 Desktop PR #429**，commit `9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9`，不是 Desktop main 或正式发布承诺：

- [包校验脚本](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/scripts/check-workbench-package.mjs)：manifest v1、ID、版本、entry、compatibility、capabilities、bundle patch 和客户端服务注入。
- [包与截图体积上限](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/packages/dsh-desktop-workbenches/submissions.mjs)：包 8 MiB、单图 2 MiB。
- [作者指南](https://github.com/dataelement/dsh-desktop/blob/9d04845dfe6b66f9df3a5e0b401b9a8e1f1d45f9/packages/dsh-desktop-workbenches/development-guide.zh.md)：安装及会话行为参考。

旧官网 `/workbench/skills/workbench-development/SKILL.md` 在本次核对时返回官网 HTML，不再作为可用的唯一规范入口。若以后恢复公开指南，应检查正文和内容类型，不能只检查 HTTP 200。

目录 YAML 不是运行时 manifest，也不是本机投稿 API。目录只规定市场元数据；不会新增宿主 API 或要求把 YAML 当作插件包。实际 SDK 以目标宿主版本为准，投稿者必须记录本机安装和使用结果。

## 与开发中指南的差异

上述指南描述“首次收录后自动跟随作者发版”。本目录采用**固定版本、更新重新审核**，截图统一由目录 YAML 声明；这是市场审核政策调整，不修改宿主加载协议。宿主公开指南、生成投稿材料与在线目录消费者仍需同步，未完成同步前不得宣称产品内投稿已兼容此协议。

v1 保留一个仓库一个根目录工作台的限制。monorepo、直接 npm 安装和自动版本发现留待消费者协议明确后扩展，不静默推断。

图片完整解码使用 sharp（Node 端 libvips），只用于维护工具和 CI，不进入 Desktop 包。现有 YAML/JSON 工具不能验证损坏图片或解压像素上限，因此增加该依赖；CI 在 Node 22 Ubuntu 上验证，其他本地平台需有 sharp 对应的预构建依赖。SemVer 用 semver 校验，避免自行维护不完整的版本正则。
