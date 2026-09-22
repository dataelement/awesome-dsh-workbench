const entryPath = /^data\/workbenches\/[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+\.yml$/

export function classifyChanges(files, { allowCatalogMaintenance = false } = {}) {
  if (files.some((file) => file.status !== 'removed' && /^(data\/index\.json|dist\/|\.cache\/)/.test(file.filename))) {
    throw new Error('不能提交生成索引 data/index.json 或旧生成目录；只允许删除已跟踪的生成文件')
  }
  const entries = files.filter((file) => [file.filename, file.previous_filename].some((name) => name?.startsWith('data/workbenches/') && name !== 'data/workbenches/.gitkeep'))
  if (!entries.length) return { type: 'maintenance' }
  // Repository members occasionally need one reviewed change to update the
  // catalog contract and every affected entry. External submissions never get
  // this capability and remain constrained to one YAML file.
  if (allowCatalogMaintenance && (files.length !== 1 || entries.length !== 1)) return { type: 'maintenance' }
  if (files.length !== 1 || entries.length !== 1) throw new Error('投稿或下架 PR 必须只修改一份工作台 YAML，不能混入其他条目或基础设施修改')
  const candidate = entries[0]
  if (!entryPath.test(candidate.filename)) throw new Error('投稿路径必须为 data/workbenches/owner__repo.yml')
  if (candidate.status === 'removed') return { type: 'removal', candidate }
  if (!['added', 'modified'].includes(candidate.status)) throw new Error('条目不允许重命名；更换仓库请由维护者评估迁移')
  return { type: 'submission', candidate }
}
