# 目录协议 v1

源文件为 `data/workbenches/<owner>__<repo>.yml`，严格使用 [Schema](../schema/workbench.schema.json)。[完整示例](../examples/workbench.yml)使用虚构来源和验证记录，只能作为结构模板，不能直接投稿；CI 使用正式校验器验证示例。

## 作者字段

| 字段 | 要求 |
| --- | --- |
| `schemaVersion` | 固定为 1；这是目录协议版本，不是宿主 SDK 版本 |
| `url` | GitHub 仓库主页，必须与文件名一致；v1 仅支持根目录 |
| `workbenchId` | 与固定源码中的工作台 ID 一致，全目录唯一 |
| `name` / `author` | 展示名称与作者/团队名称，不要求个人邮箱 |
| `version` | 完整 SemVer，与固定源码的 manifest 和 package.json 一致 |
| `category` | [七个分类](../data/categories.json)之一 |
| `description.zh` | 10–200 字符，真实功能说明，不含夸大宣传 |
| `source.commit` | 40 位小写 commit SHA，不接受分支、短 SHA 或 tag |
| `screenshots` | 1–5 个 `{path, alt}`，有序，第一张作为封面 |
| `verification.desktopVersion` | 实测 Desktop 完整 SemVer，不能填预计支持范围 |
| `verification.platforms` | 实测系统与架构的列表 |
| `verification.steps` / `results` / `limitations` | 可复现步骤、实际结果和未验证项；无已知限制也需明确写出 |
| `requirements.permissions` / `services` | 文件、网络、工具等权限与外部服务；不需要时填空数组 |
| `requirements.setup` / `cost` | 安装、初始化、卸载说明，以及外部服务费用/限制 |
| `release.url` / `release.sha256` | 可选；同仓库固定 Release 的 `.tgz` 与 64 位小写 SHA-256，必须同时提供 |

未知字段被拒绝。作者不能填写派生的仓库标识、探测状态、npm 映射或审核结论。完整 YAML 不超过 32 KiB。

## 截图与封面

市场图片声明只读取 YAML，不从 `workbench.json`、`screenshots.json` 或 README 自动补充。工作台包可保留宿主自己使用的图片字段，两者用途不同。

- 图片放作者仓库，`path` 相对于 `source.commit` 的仓库根目录。源码与图片共用一个固定 commit。
- 1–5 张 PNG/JPEG/WebP，每张不超过 **2 MiB（2 × 1024 × 1024 bytes）**；必须是可完整解码的静态图片，总像素不超过 16 MiPixels。
- 路径不得包含绝对路径、反斜线、`..`、URL、查询参数或编码逃逸；同一图片不能重复列出。
- `alt` 必填，1–300 字符。数组第一张为封面，其余按顺序展示。
- 建议横向 16:9、宽度至少 1280px；尺寸比例不是硬门槛，展示端应等比适配，不能擅自裁掉关键内容。
- 使用真实工作台界面，避免个人信息、凭据、客户数据；素材必须有使用权。内容真实性和授权由人工审核。

CI 下载图片并校验实际格式、扩展名、字节数、像素数和完整解码；输出固定 commit URL、尺寸、大小及 SHA-256。图片修改需更新 commit 并重新审核。

## 源码与安装包

固定源码必须包含 `workbench.json`、`package.json`、安全的入口路径、`dsh.bundle.patch` 指向的文件，并声明客户端注入 `dsh-desktop-workbenches`。这些要求来自[宿主开发中实现](../docs/host-contract.md)，不代表所有已发布 Desktop 都支持。

未提供 Release 时，目录输出固定源码 commit；v1 要求源码入口文件可直接读取，不代替作者执行构建。若构建产物不在源码中，应提供 Release 包，CI 检查包内入口。Release 包压缩后不超过 **8 MiB**，SHA-256 必须一致；解包不执行代码，拒绝符号链接和越界路径，限制解压体积、文件数，核对 ID/版本、包内入口与 bundle patch。

包与源码 ID/版本一致并不证明可重复构建或逐字节等价。维护者仍需检查发布来源及构建流程。npm 信息只是辅助映射，不构成已验证的 npm 安装包。

## 生成与协议迁移

`npm run generate` 只生成离线预览。`npm run probe` 执行完整联网校验，全部通过后生成发布候选；任一失败不覆盖线上目录。`dist/` 不提交，CI artifact 包含目录和校验清单。

目录自身的 `schemaVersion` 与条目输入版本分别维护。破坏性变更必须同步 Schema、example、生成器、消费者契约和迁移说明，并在 PR 中明确；现有旧草稿尚未正式发布，本次迁移要求补齐新增字段，不推断实测结果。
