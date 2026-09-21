# 工作台目录协议

一个 GitHub 仓库对应一个工作台条目，文件名为 `data/workbenches/<owner>__<repo>.yml`。仓库地址就是目录身份，不另外申请 ID；重命名或转移后应更新到当前主页，旧重定向地址不能重复收录。

## 作者只填写展示信息

```yaml
url: https://github.com/owner/repo
name: 示例工作台
category: productivity
description: 帮助整理项目资料、跟进任务并生成工作报告。
screenshots:
  - docs/images/overview.webp
  - docs/images/result.png
# 可选：没有可用 npm 包时采用此 Release。
# release: https://github.com/owner/repo/releases/latest/download/workbench.tgz
```

| 字段 | 要求 |
| --- | --- |
| `url` | GitHub 仓库主页，与文件名一致 |
| `name` | 展示名称，1–60 字符 |
| `category` | [七个分类](../data/categories.json)之一 |
| `description` | 一句话中文介绍，10–200 字符 |
| `screenshots` | 1–5 个仓库内图片路径，第一张为封面 |
| `release` | 可选，同仓库 `.tgz` Release 链接，支持固定 tag 或 `latest/download/固定文件名` |

[完整 example](../examples/workbench.yml)直接使用正式 [Schema](../schema/workbench.schema.json)校验。不要填作者 ID、版本、源码 commit、npm 包名、校验值、验证记录或权限表。这些分别来自 GitHub、工作台包、自动探测及 PR 审核材料。输入 YAML 没有独立 `schemaVersion`，输出目录保留机器协议版本。

## 安装来源：npm → Release → 源码

1. **npm**：从源码 `package.json.name` 发现包名。源码与 npm 最新发布版本的 `repository` 都指回该 GitHub 仓库才采用；下载包，校验 registry 的 SHA-512 integrity、包名、版本、工作台 ID 和可安装文件。输出精确版本、固定下载地址及 SHA-256，客户端不能重新解析 latest。
2. **Release**：无可用 npm 映射时，采用 YAML 中的 `release`。`latest/download` 先通过 GitHub API 解析为固定 tag 的同名资源，再下载、检查包并生成 SHA-256；安装版本读取实际包。未填写就继续使用源码，不猜测多个 Release 资源中哪个可安装。
3. **源码**：无 npm 映射且未声明 Release 时，解析默认分支为完整 commit，检查实际入口与 bundle patch，输出固定 commit。客户端使用这次解析结果，不重新解析分支。

只有“未发布 npm 包 / npm 归属不符 / 没有声明 Release”才进入下一层。限流、超时、已选安装包损坏或配置的 Release 失效会阻止本次发布，不能悄悄换来源掩盖故障。

源码默认分支可能比正式 npm/Release 版本更新，因此不要求二者版本相同。包自身的 manifest/package 版本必须一致，工作台 ID 应保持稳定并与源码声明一致。目录唯一键是仓库；运行时 ID 是从包读取的宿主标识，宿主安装时仍需处理运行时 ID 冲突。

## 截图标准

- 截图声明仅在 YAML，不从 README、`screenshots.json` 或 manifest 补充。
- 图片放作者仓库，使用相对路径；每次构建解析默认分支 commit 后，图片 URL 固定到该 commit。
- 1–5 张静态 PNG/JPEG/WebP；单张不超过 2 MiB，总像素不超过 16 MiPixels。校验真实格式、扩展名、完整解码与大小。
- 不允许绝对路径、`..`、反斜线、外部 URL、编码逃逸或重复路径。
- 第一张为封面，按列表顺序显示，辅助文本由工作台名称和图片序号生成。
- 建议横向 16:9、宽度至少 1280px；比例不是硬门槛，展示端等比适配。
- 必须是真实产品画面，拥有素材使用权，不含凭据、个人信息或客户数据。图片应与用户可安装的版本相符，由作者维护、人工抽查。

修改图片内容或发布版本无需目录 PR；修改图片路径、顺序、名称、分类、简介、仓库或固定 Release 链接时更新 YAML。

## 包与宿主

v1 只支持仓库根目录的一个工作台，暂不支持 monorepo 子目录。实际包需满足[宿主契约](../docs/host-contract.md)：manifest v1、版本一致、安全入口、`dsh.bundle.patch` 及客户端注入。包不超过 8 MiB，解包不执行代码，拒绝越界和链接，限制解压体积与文件数。源码安装要求入口已存在，目录构建不替作者编译。

## 生成产物

`npm run generate` 生成离线展示预览，不声明安装来源已验证。`npm run probe` 解析安装优先级并校验，输出 `distribution`、实际版本、源码 commit、运行时 ID、图片 URL/校验值及探测状态。不要把这些生成字段抄回 YAML。

`dist/` 不提交；全部探测通过后才生成发布候选。首次收录经过人工审核，后续发版由作者负责并自动探测；这不意味着每个后续版本经过人工审核或安全审计。
