# 目录协议与 Awesome DSH Plugin 的对照

本次依据参考项目 commit `242d2a8d3709c017fb4af9b80603f6ae847948c7` 的真实实现，区分作者输入、自动探测和消费者输出：

- [entries.mjs](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/242d2a8d3709c017fb4af9b80603f6ae847948c7/scripts/lib/entries.mjs)：允许的投稿字段、单行描述、可选 tarball。
- [probe-npm.mjs](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/242d2a8d3709c017fb4af9b80603f6ae847948c7/scripts/probe-npm.mjs)：npm 发现、仓库归属和失败时保留缓存。
- [probe-tarballs.mjs](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/242d2a8d3709c017fb4af9b80603f6ae847948c7/scripts/probe-tarballs.mjs)：只探测作者声明的安装包，不按 Release 文件名猜测。
- [build-site.mjs](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/242d2a8d3709c017fb4af9b80603f6ae847948c7/scripts/build-site.mjs)：公布 npm、tarball 和展示用 install 字符串。
- [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/242d2a8d3709c017fb4af9b80603f6ae847948c7/contributing.md)：一文件投稿、截图声明和人工审核。

## 采用与差异

| 内容 | 参考项目 | 工作台目录的明确选择 |
| --- | --- | --- |
| 条目身份 | URL，支持仓库及子目录 | v1 仅根仓库，owner/repo 忽略大小写；不冒充已支持 monorepo |
| 名称 | 作者填写 name，属于展示文案 | 按本项目要求从 repo.name 获得，不增加 name 字段；不是自动得到工作台的产品标题 |
| 描述 | en 必填、zh 可补；只接受已支持语言和单行 | zh/en 均必填，单行非空；不设置没有依据的 10 字符门槛；不自动翻译或由 About 覆盖 |
| npm | 从仓库发现并验证归属，不接受手填 npm | 同样自动发现；保留精确仓库归属校验，不能照搬其 substring 匹配 |
| Release | 可选 tarball URL，作者明确选择 | 同名可选字段，仅同仓库 GitHub Release；不猜 workbench.tgz 或唯一 tgz |
| 截图 | 作者仓库 screenshots.json，保留旧集中表回退 | 按本项目要求与条目同一 YAML，路径、数量及顺序由作者决定 |
| 安装选择 | npm → 声明的 tarball → GitHub 源码 | 相同优先级；输出固定的包位置或 commit，不输出可执行命令 |
| 失败恢复 | 按探测来源保留旧缓存，确定失效时降级 | v1 暂采用完整候选验证失败则保留上一整份线上目录；不声称已实现逐条缓存或失效降级 |

## 修正的问题

此前版本把“能列出 Release 附件”等同于“能确定作者要安装的包”，自行引入 `workbench.tgz` 优先规则，可能把辅助包当作工作台。这不是参考项目的协议，已经删除。`tarball` 是可选的安装选择，不是要求作者重复填写可自动获取的版本、包名或 checksum。

此前只有 YAML Schema，却将未解析安装来源的离线结果也写为 catalog.json；特别是空数组会绕过“每项 probe.ok”检查。现在预览标记 `kind: preview`，正式输出标记 `kind: catalog`，由独立 Schema 和跨字段校验阻止预览发布。

字段分工固定下来：YAML 表达分类、双语文案、截图和可选包选择；包及仓库提供运行信息；生成 JSON 提供客户端读取契约；人工审核证据留在 PR。调整这些边界需要同时修改 Schema、示例、校验器、消费者说明和回归测试，不能只删增字段。

## 尚未解决的产品接入

宿主工作台实现仍按 docs/host-contract.md 的固定源码参考，消费者尚未验证；不能宣称本站 JSON 可被所有 Desktop 版本直接使用。逐条探测缓存、monorepo 与原生平台安装联调是后续工作，不能只通过加字段假装已经具备。
