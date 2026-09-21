# 目录运行手册

## 首次启用

仓库管理员在启用目录发布时完成以下配置：

1. 在 main 配置分支保护或 ruleset：必须通过 PR；至少一名维护者批准；新提交撤销旧审批；要求分支更新至最新 main。启用 `validate`（Catalog CI）和 `Trusted catalog probe` 必需检查，尽可能将检查来源限制为 GitHub Actions；禁止强推和删除 main。
2. 等检查在工作流上实际运行后，再将对应检查设为 required。
3. 在 Settings → Pages 将 Build and deployment 的 Source 设为 GitHub Actions，并按需配置 `github-pages` 环境规则。仓库为 Public 时 Pages 和标准 Actions runner 可免费使用。
4. 手动运行 Publish workbench index，核对 Pages 返回地址下的 `/index.json`。该文件由 runner 从 `data/workbenches/*.yml` 生成，不提交到仓库。
5. 将 Pages 的 `/index.json` 地址配置给 Desktop，并单独验收读取、展示和安装；Pages 可访问不等于客户端已经接入。

不要将示例的虚构工作台放入正式目录。首次空目录可以验证部署基础设施，但不能替代真实投稿验收。

## 自动化职责

| 工作流 | 触发及作用 |
| --- | --- |
| Catalog CI | 所有 PR 和 main push：离线 Schema/example、测试和投稿范围 |
| Catalog candidate → Trusted catalog PR gate | PR 触发无密钥排队，可信 main 脚本通过 API 读取固定 head，检查投稿来源并回写结果 |
| Publish workbench index | main push / 手动：完整探测及索引 Schema 校验，生成 `data/index.json`，上传 `data/` 并部署 Pages |
| 同一构建的每日 schedule | 重新解析 npm → Release → 源码并检查截图，全部成功后刷新 Pages 索引 |

维护者订阅该仓库 Actions 失败通知。定期更新的失败在运行记录中可见；目前不自动给作者发消息，也不自动下架。处理时区分网络/限流与确定性失效，确认后通过 PR 修复或下架。

构建只有全部探测成功才输出新的完整索引；失败不会进入部署步骤，Pages 保持上次成功版本。push 与定时/手工探测使用不同并发组，同类旧运行会被新运行替代。

## 失败与回滚

- PR 网络限流：可信检查标为失败并说明未完成，重跑 Catalog candidate，不能以 neutral 当作通过。
- 构建失败：查日志，修复原因后重跑；不要手工编辑生成 JSON。
- 回滚：在 main 通过 PR 回退对应条目或构建逻辑，再重新运行发布工作流。索引仍会重新解析 npm latest、Release latest 和默认分支，因此目录回退不等于安装版本回滚。

生产域名、客户端索引地址和告警接收人需由维护者配置，不能写入个人账号或凭据。
