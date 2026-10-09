# 工作台安全与标准审核

投稿新增或修改工作台时，`Workbench security review` 从可信 base 代码运行，重复执行实际来源探测，并用 Copilot CLI 1.0.94 的 **gpt-6-luna** 审阅完整有界文本材料和截图。不 checkout、构建、安装或运行作者代码；显式设置空工具列表，禁用内置 MCP、用户配置和自定义指令；没有模型 shell 或自动合并能力。模型不能批准 PR。

## 审核标准

- [官网市场验收规范](https://dshdesktop.com/workbench/docs/market-acceptance/)的[固定副本](review/market-acceptance.md)，2026-09-29。
- [官网开发规范](https://dshdesktop.com/workbench/docs/development/)的[固定副本](review/development.md)，2026-10-08；市场验收引用其运行规则与自测清单。

标准固定在可信仓库中，经维护者 PR 更新；避免线上文档变更悄悄改变审核。目录字段仍以现有 Schema 为准（例如当前 nameEn、旧 workbenchId 兼容规则）。模型逐项判断 12 项：身份授权、真实功能与重复、包契约、安全行为、数据、界面、目录、会话、模式、依赖披露、实测证据、截图。建议与可选项不作硬性拒绝条件。

每项为 pass / fail / needs_human；全部 pass 才通过机器门禁。通过项必须引用存在于审核材料中的文件和原文。没有实测证据、未知或材料不完整都阻止通过，维护者帮助作者补充后重跑，不设置自动忽略或模型自批通道。作者自己的“通过”声明不是系统批准；维护者仍须核对真实 Desktop 验证。

## 材料与安全边界

- 从 PR 最新 head 读取单个 YAML 和 PR 描述；所有作者身份均受相同单条目规则约束。
- GitHub 源码固定完整 commit；npm/Release 审核实际下载的包，重新校验 integrity/版本/哈希。源码与发布包分开提供给模型，截图重新核对 SHA-256。
- 复用安全解包器：8 MiB 压缩包、64 MiB 解压内容、500 文件，无链接与越界，不执行任何代码。
- 相关文本每文件最多 512 KiB，整体每个来源最多 2 MiB；全部读入，不截取源码。超过上限、敏感文件、明显秘密、不完整输入和网络/API/模型错误都失败。非文本文件列入清单，截图另以图像输入；其余二进制行为无法靠此静态审阅证明安全，必须在人工审核中判断。
- 公开源码、安装包文本、PR 描述和图片通过 Copilot 发送给模型；Copilot 本地会话文件位于独立临时目录，结束后删除；不在 prompt 中发送 Actions token/PAT。秘密探测是启发式，作者与维护者仍负责资料脱敏，不能保证发现所有秘密。
- 所有作者材料被标为不可信；模型没有工具。提示注入防护不能保证模型永不误判，因此人工批准是独立必需门禁。
- Check Run 写到本次 PR head，结束前重新核对当前 head。PR 推送或正文修改重新审核；报告记录标准及材料哈希、源 commit、分发版本与哈希。正文修改本身不改变 commit，维护者必须检查最新运行已完成。

## 管理员启用

1. 用仓库 Settings → Secrets and variables → Actions 配置 `MODELS_TOKEN`（使用具有 Copilot Requests 权限的细粒度 PAT；审核进程通过 COPILOT_GITHUB_TOKEN 接收，不传递仓库 Actions token）。固定使用 gpt-6-luna，不因不可用切换模型。
2. 合并审核工作流后，为真实投稿运行一次。`pull_request_target` 使用 base 代码，所以添加此工作流的 PR 不会运行尚未合并的新审核器；本 PR 用本地隔离测试验证，合并后做真实模型验收。
3. main 分支保护要求 PR、至少一名维护者批准、撤销旧审批、要求批准最新 push、禁止作者自批、禁止强推/删除，限制绕过权限；必须检查 `validate`、`Trusted catalog probe` 和 **Workbench security review**，来源限定 GitHub Actions。最后一个是显式写到 PR head 的 Check Run，不能误选 `Run trusted security reviewer` 作业。
4. 合并前确认本次 head 的最新安全 Check Run 与运行日志。PAT 缺失、检查跳过、网络失败、模型拒绝/输出不完整不算通过。

维护 PR 或纯下架 PR 会明确返回不适用而不调用模型，但仍需要维护者批准。混合投稿或批量改条目不能借维护者身份跳过安全检查；拆成单条目 PR。

机器审阅不是完整安全审计，也不会真的运行 Desktop。普通作者后续 npm/Release 发版不产生目录 PR，不会触发本次 LLM 门禁；发布探测仍执行原有安装检查。若需逐版本审核，必须另外设计审核快照与发布版本绑定，不能声称本机制已覆盖。
