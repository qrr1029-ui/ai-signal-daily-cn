# 凯希的 AI 信号屋

一份面向产品、创业与投资判断的开源 AI 行业早报。每天扫描国内外重要动态，先核验来源和首次公开时间，再把真正会影响决策的十条信号整理成公开网页。

读者不需要 ChatGPT、Codex 或微信登录。网站由 GitHub Pages 持续托管；个人电脑关机后也能正常访问。当前推荐由管理员每天请 Codex 整理新一期并提交到 GitHub，页面会随提交自动发布。微信公众号暂不依赖群发 API，而是提供一份可直接复制到公众号后台的富文本排版稿，由管理员预览后手动发布。

> 本项目整理公开信息，不构成投资、法律或其他专业建议。

## 每天怎样更新

```text
请 Codex 扫描、核验并整理北京时间 09:00 截止的新一期
                         ↓
       提交静态 JSON 到 GitHub → Pages 自动发布网页
                         ↓
          /wechat.html → 人工复制、预览并发布公众号
```

- 信息窗口固定为北京时间 `[前一日 09:00, 当日 09:00)`；09:00 整发布的内容归入下一期。
- 不配置 `OPENAI_API_KEY` 时，每天 09:07 / 09:22 的自动任务会显示一条跳过通知并正常结束，不调用模型、不产生 API 费用，也不会影响当前网页。
- 管理员或 Codex 提交新一期数据后，`Deploy GitHub Pages` 会自动构建并上线，无需保持本机持续运行。
- 如以后配置 `OPENAI_API_KEY`，09:07 主任务和 09:22 兜底任务会自动恢复；兜底发现当日期刊已生成时不会再次调用模型。
- 新一期只有在十条信息全部通过结构、来源和时间校验后才会替换首页。任何一步失败，线上继续保留上一期。

## 内容口径

- 完整扫描 AI 应用、物理 AI、AI + 硬件、AI 大模型、Vibe Coding、AI Agent 六个赛道，再从科技前沿、商业与资本、产品与创业、SaaS、政策与宏观视角复评。
- 不按赛道机械平均，也不拿旧闻、小功能或软宣传凑数；若当天无法找到十条达到证据门槛的信息，本期生成失败并保留上一期。
- 优先使用公司官网、政府或监管公告、财报、arXiv、GitHub 等一手来源；再用 Reuters、BBC、TechCrunch、财新、36氪或权威研究机构交叉核验。
- Reddit、Hacker News、X 只补充社区信号，不单独支撑关键事实。
- 系统会核对来源页中的机器可读发布时间，不信任模型自报时间、网页更新时间、URL 日期或没有明确时间的 PDF。
- 事实、判断、机会与风险分开表达；只在全篇真正关键的少数短语上使用荧光高亮。

更完整的规则见 [EDITORIAL_POLICY.md](EDITORIAL_POLICY.md)。

## 免费部署到 GitHub

公共仓库可使用 GitHub-hosted runner 与 GitHub Pages。Cloudflare、D1、Wrangler、微信 AppSecret 和 OpenAI API Key 都不是人工更新模式的前置条件。只有启用无人值守生成时，才需要自行准备 OpenAI API Key 与账户额度。

### 1. 准备仓库

1. Fork 本仓库，或把代码导入一个新的 **Public** GitHub 仓库。
2. 打开 **Settings → Actions → General → Workflow permissions**，选择 **Read and write permissions**。
3. 打开 **Settings → Pages → Build and deployment**，将 Source 设为 **GitHub Actions**。

### 2. 选择更新模式

默认采用免费的人工更新模式，无需添加任何 Secret：请 Codex 生成并校验新一期，提交到默认分支后，Pages 会自动发布。

如需启用无人值守生成，再打开 **Settings → Secrets and variables → Actions**：

- 在 **Secrets** 中新建 `OPENAI_API_KEY`。密钥只粘贴到 GitHub，绝不要写进仓库、Issue、截图或聊天。
- 可在 **Variables** 中新建 `OPENAI_MODEL`；不设置时使用项目默认模型。

### 3. 首次发布

打开 **Actions**：

1. 手动运行 `Deploy GitHub Pages`，先发布仓库自带的示例期刊。
2. 人工模式下，提交一份新期刊，确认 `Deploy GitHub Pages` 自动运行成功。
3. 自动模式下，再手动运行 `Generate daily AI brief`，确认联网生成、校验、提交和页面发布全部成功。

未配置 `OPENAI_API_KEY` 时，`Generate daily AI brief` 会正常跳过，而不是产生红色失败记录。

如果默认分支开启了保护规则，需要允许 GitHub Actions 向自动生成的数据路径提交，或按团队规范改成自动 Pull Request。

## 公众号发布

当前订阅号后台没有“上传图文消息素材、预览、按标签群发、查询群发状态”等 API 权限，所以不能可靠地实现无人值守群发。项目采用更稳妥的人工确认流程：

1. 打开网站右上角的 **公众号排版**，对应静态页面 `/wechat.html`。
2. 点击 **复制公众号全文**。
3. 在微信公众平台新建图文，粘贴内容。
4. 检查荧光重点、段距、来源链接和长标题换行，先发手机预览。
5. 确认无误后发布。

复制按钮会同时写入富文本 HTML 与纯文本兜底；公众号正文使用内联样式，以减少微信编辑器清洗造成的格式丢失。这个流程不需要 AppID、AppSecret 或固定出口 IP。

## 本地开发

要求 Node.js `>=22.13.0`。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
npm run dev
```

完整检查：

```bash
npm run lint
npm test
```

本地不填写 API Key 也可以浏览、编辑并发布仓库内的期刊；只有执行联网自动生成命令时才需要密钥。

## 数据与自动化

- `public/data/latest.json`：首页使用的最新一期。
- `public/data/issues/YYYY-MM-DD.json`：按日期保存的历史期刊。
- `public/data/issues/index.json`：历史期刊索引。
- `scripts/generate-daily.ts`：联网生成、核验与原子写入入口。
- `.github/workflows/daily-brief.yml`：有 API Key 时每日生成；无 Key 时安全跳过。
- `.github/workflows/pages.yml`：普通代码提交后的静态站发布。

自动生成的提交只包含通过校验的公开 JSON，不保存 API 响应原文、Authorization Header 或任何 Secret。

## 环境变量

| 名称 | 存放位置 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | GitHub Actions Secret / 本地 `.env.local` | 联网检索与生成 |
| `OPENAI_MODEL` | GitHub Actions Variable / 本地 `.env.local` | 可选的模型名称 |
| `PUBLIC_SITE_URL` | 构建环境 | 站点 canonical 与分享链接 |
| `NEXT_PUBLIC_BASE_PATH` | Pages 工作流自动设置 | GitHub 项目站点的仓库子路径 |

## 运行限制

- GitHub 可能延迟定时任务；公共仓库若连续 60 天没有活动，scheduled workflow 也可能被自动停用。维护者应定期查看 Actions 状态。
- `github.io` 及外链在中国大陆或微信内的可达性可能波动。公众号正文会完整复制核心内容，不强迫读者依赖外链；后续也可绑定自定义域名。
- OpenAI API 不是免费的；人工更新模式不会调用它。如以后启用自动生成，模型、搜索上下文和重试次数都会影响成本，建议设置用量上限与告警。

## 参与贡献

欢迎提交 Issue 和 Pull Request。修改新闻来源、时间窗口或验证规则前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## License

[MIT](LICENSE)
