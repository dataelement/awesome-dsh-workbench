# 工作台目录协议

一个 GitHub 仓库对应一个工作台条目，文件名为 `data/workbenches/<owner>__<repo>.yml`。仓库地址就是目录身份，不另外申请 ID；重命名或转移后应更新到当前主页，旧重定向地址不能重复收录。

## YAML 只保留目录编排信息

```yaml
url: https://github.com/owner/repo
category: productivity
description:
  zh: 帮助整理项目资料、跟进任务并生成工作报告。
  en: Organize project materials, track tasks, and generate work reports.
screenshots:
  - docs/images/overview.webp
  - docs/images/result.png
```

| 字段 | 要求 |
| --- | --- |
| `url` | GitHub 仓库主页，与文件名一致 |
| `category` | [七个分类](../data/categories.json)之一 |
| `description.zh` / `description.en` | 中英文介绍均必填，各 10–200 字符，不接受空白字符串 |
| `screenshots` | 1–5 个仓库内图片路径，第一张为封面 |

[完整 example](../examples/workbench.yml)直接使用正式 [Schema](../schema/workbench.schema.json)校验。不要填名称、Release URL、作者 ID、版本、源码 commit、npm 包名、校验值、验证记录或权限表。这些分别来自 GitHub、工作台包、自动探测及 PR 审核材料。输入 YAML 没有独立 `schemaVersion`，输出目录保留机器协议版本。

## 安装来源：npm → Release → 源码

1. **npm**：从源码 `package.json.name` 发现包名。源码与 npm 最新发布版本的 `repository` 都指回该 GitHub 仓库才采用；下载包，校验 registry 的 SHA-512 integrity、包名、版本、工作台 ID 和可安装文件。输出精确版本、固定下载地址及 SHA-256，客户端不能重新解析 latest。
2. **Release**：无可用 npm 映射时，读取 GitHub 最新正式 Release。优先选择名为 `workbench.tgz` 的资源，否则使用唯一的 `.tgz`；多个 `.tgz` 无法明确选择时停止并提示作者规范资源命名。下载地址由 GitHub 返回并限定为同仓库的固定 tag，下载后检查包并生成 SHA-256，安装版本读取实际包。预发布版本不自动选入。
3. **源码**：仓库没有正式 Release，或最新正式 Release 没有 `.tgz` 时，解析默认分支为完整 commit，检查实际入口与 bundle patch，输出固定 commit。客户端使用这次解析结果，不重新解析分支。

只有“未发布 npm 包 / npm 归属不符 / 没有 Release 安装包”才进入下一层。限流、超时、已选安装包损坏或已发现的 Release 资源失效会阻止本次发布，不能悄悄换来源掩盖故障。

## 自动获得的展示信息

- 名称：GitHub `repo.name`，离线预览临时使用 URL 中的仓库名。
- 简介由 YAML 的 `description.zh` 和 `description.en` 提供，离线预览和在线目录均保留两种语言，不使用 GitHub About 或 manifest 覆盖。
- 仓库身份、作者归属和许可证：GitHub 仓库元数据。
- 包名、版本、运行时 ID、兼容性、安装地址和校验值：源码与选中发布包。

这些信息随定期探测刷新。修改 GitHub About、发布新包或更新原路径图片都不需要目录 PR。分类、双语介绍和截图顺序属于市场编排，无法可靠地从 repo 元数据获取，因此保留在 YAML。

源码默认分支可能比正式 npm/Release 版本更新，因此不要求二者版本相同。包自身的 manifest/package 版本必须一致，工作台 ID 应保持稳定并与源码声明一致。目录唯一键是仓库；运行时 ID 是从包读取的宿主标识，宿主安装时仍需处理运行时 ID 冲突。

## 截图标准

- 截图声明仅在 YAML，不从 README、`screenshots.json` 或 manifest 补充。
- 图片放作者仓库，使用相对路径；每次构建解析默认分支 commit 后，图片 URL 固定到该 commit。
- 1–5 张静态 PNG/JPEG/WebP；单张不超过 2 MiB，总像素不超过 16 MiPixels。校验真实格式、扩展名、完整解码与大小。
- 不允许绝对路径、`..`、反斜线、外部 URL、编码逃逸或重复路径。
- 第一张为封面，按列表顺序显示，辅助文本由工作台名称和图片序号生成。
- 建议横向 16:9、宽度至少 1280px；比例不是硬门槛，展示端等比适配。
- 必须是真实产品画面，拥有素材使用权，不含凭据、个人信息或客户数据。图片应与用户可安装的版本相符，由作者维护、人工抽查。

修改图片内容或发布版本无需目录 PR；双语介绍、图片路径、顺序、分类或仓库地址改变时更新 YAML。

## 包与宿主

v1 只支持仓库根目录的一个工作台，暂不支持 monorepo 子目录。实际包需满足[宿主契约](../docs/host-contract.md)：manifest v1、版本一致、安全入口、`dsh.bundle.patch` 及客户端注入。包不超过 8 MiB，解包不执行代码，拒绝越界和链接，限制解压体积与文件数。源码安装要求入口已存在，目录构建不替作者编译。

## 生成产物

`npm run generate` 生成离线展示预览，不声明安装来源已验证。`npm run probe` 解析安装优先级并校验，输出 `distribution`、实际版本、源码 commit、运行时 ID、图片 URL/校验值及探测状态。不要把这些生成字段抄回 YAML。

`dist/` 不提交；全部探测通过后才生成发布候选。首次收录经过人工审核，后续发版由作者负责并自动探测；这不意味着每个后续版本经过人工审核或安全审计。
