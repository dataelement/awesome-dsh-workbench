# 目录运行手册

## 首次启用

仓库管理员在启用目录发布时完成以下配置：

1. 在 main 配置分支保护或 ruleset：必须通过 PR；至少一名维护者批准；新提交撤销旧审批；要求分支更新至最新 main。启用 `validate`（Catalog CI）和 `Trusted catalog probe` 必需检查，尽可能将检查来源限制为 GitHub Actions；禁止强推和删除 main。
2. 等检查在工作流上实际运行后，再将对应检查设为 required。
3. 若需要公开目录，设置 GitHub Pages 来源为 GitHub Actions，配置 `github-pages` 环境审批/分支规则，再将仓库变量 `PUBLISH_CATALOG` 设为 `true`。未设置时仅产生 artifact。
4. 手动运行 Build catalog artifact，核对 Pages 返回地址下的 `catalog.json`、`catalog.sha256`、`publication.json`。三者必须对应同一次部署。
5. Desktop 消费者接入地址、协议和安装方式需单独验收，不能把 Pages 可访问当作客户端可安装。

不要将示例的虚构工作台放入正式目录。首次空目录可以验证部署基础设施，但不能替代真实投稿验收。

## 自动化职责

| 工作流 | 触发及作用 |
| --- | --- |
| Catalog CI | 所有 PR 和 main push：离线 Schema/example、测试、离线预览生成、投稿范围 |
| Catalog candidate → Trusted catalog PR gate | PR 触发无密钥排队，可信 main 脚本通过 API 读取固定 head，检查投稿来源并回写结果 |
| Build catalog artifact | main push / 手动：完整探测及发布 JSON Schema 校验，生成 artifact；启用发布变量后部署 Pages |
| 同一构建的每日 schedule | 重新解析 npm → Release → 源码并检查截图，全部成功后产出 artifact；启用发布后自动刷新目录 |

维护者订阅该仓库 Actions 失败通知。定期更新的失败在运行记录中可见；目前不自动给作者发消息，也不自动下架。处理时区分网络/限流与确定性失效，确认后通过 PR 修复或下架。

构建只有全部探测成功才输出新的完整目录；失败会保持上次 Pages 部署。部署使用一个 Pages artifact，三份文件一起切换。并发发布串行执行，定时探测不会取消进行中的发布。

## 失败与回滚

- PR 网络限流：可信检查标为失败并说明未完成，重跑 Catalog candidate，不能以 neutral 当作通过。
- 构建失败：查日志，修复原因后重跑；不要手工编辑生成 JSON。
- 回滚：手动运行 Build catalog artifact，将 `source_commit` 填为已合入 main 的完整历史 commit，重建并探测该目录信息后部署。流程拒绝非 main 祖先。这是目录信息回退：npm latest、Release latest 和默认分支仍按当前状态解析，不是安装版本回滚。历史 commit 必须含本版构建工具；若旧来源失效，重建会停止并保留当前线上版本，不承诺可以脱离来源恢复历史字节。
- 回滚后若要持续保留该版本，需在 main 提交对应回退 PR，否则下一次 main 发布会恢复当前源数据。
- `publication.json.sourceCommit` 是目录仓库 revision；每个条目的 `sourceCommit` 是作者源码 revision，两者不能混淆。

下载构建 artifact 后可执行 `shasum -a 256 -c catalog.sha256` 检查目录内容。生产地址、域名、访问控制和告警接收人需维护者配置，不能写入个人账号或凭据。
