# LightPic 开发进度日志 · 2026-05-18

本次 session 的主线:把 analyze + generate 的 5 步流程从「本地能跑、线上没接通」推到「线上完整跑通,3 张图稳定生成」。

---

## 起点状态

- `/api/analyze` 路由代码已存在于本地工作区,但**未提交**、未部署
- 线上 Worker 没有 `ANTHROPIC_API_KEY` secret → 任何分析请求都返回 `500 Server is missing ANTHROPIC_API_KEY`
- 项目历史上一直走诗云中转,但代码里**没有 `ANTHROPIC_BASE_URL` 支持**,SDK 默认会发到官方 `api.anthropic.com`
- `page.tsx` 里 5 步流程 + 双栏布局已经写好,但有 3 个 lint 错误(嵌套组件 + `Date.now()` 不纯)

## 今日完成

### 1. 代码合入 + 推到 GitHub
- 把工作区的两块改动按职责拆成独立 commit:
  - `b332e4c` feat(api): 新增 `/api/analyze`,Anthropic SDK + json_schema 输出
  - `dabaccb` feat(ui): page.tsx 重写为 5-step flow + split layout
- 修了 3 个 lint 错误:`LeftPane` / `RightPane` 改成 `renderLeftPane()` / `renderRightPane()` helper(避免每次 render 重建组件 + 子树 state 重置);下载文件名去掉 `Date.now()` 改用 `planItem.id`
- 推到 `origin/main`

### 2. 接入诗云中转(替换官方 Anthropic)
- 确认现状:代码硬编码官方端点、`new Anthropic({ apiKey })` 没传 baseURL
- `42d095e` 在 SDK 初始化时支持 `ANTHROPIC_BASE_URL`,空字符串/未设置时回落官方
- `94add16` 把 `ANTHROPIC_BASE_URL=https://shiyunapi.com` 写进 `wrangler.jsonc` 的 `vars` 段(避免每次 deploy 被覆盖,也让配置进 Git 可审计)
- Cloudflare 端添加 secret:`ANTHROPIC_API_KEY` = 诗云 key

### 3. 模型对齐诗云供应商目录
- 诗云后台没有 `claude-opus-4-5`,可用列表是 `claude-opus-4-7` / `claude-sonnet-4-5-20250929` / `claude-3-haiku-20240307`
- `575397d` 把 analyze 的 model 改成 `claude-sonnet-4-5-20250929`(对结构化视觉分析够用,成本/延迟更友好)

### 4. JSON 解析容错
- 现象:模型调通后前端报「Claude returned invalid JSON」
- 根因:诗云作为代理大概率不转发 `output_config.format.json_schema`,模型失去强制结构化约束,会包 ` ```json fences` 或加导语
- `a1c985a` 修复:
  - SYSTEM_PROMPT 加严格 JSON-only 段落
  - 新增 `extractJson()` 兜底解析:剥围栏 → 直接 parse → 截 `{...}` 再 parse
  - 失败时打印**完整 rawText** 到 Cloudflare logs,便于排查

### 5. 生成阶段稳定性
- 现象:3 张图并发请求 Replicate,1-2 张返回 `Replicate returned non-JSON on create (HTTP 429)`
- 根因:① 前端 `Promise.all` 同时打 3 个请求 → 触发 Replicate per-second 限流;② 后端 `fetchWithRetry` 不处理 429
- `135ed23` 修复:
  - 前端 `startGenerate` / `regenerateAll` 改成 `for` 串行,每张之间 sleep 2.5s
  - 后端 `fetchWithRetry` 加 429 特殊路径:等 5s 重试 1 次(额外于常规 retry 配额)
  - 保留单张失败不影响其他张的语义(`generateOne` 内部 try/catch,从不抛)

### 6. 部署
- 全程 `npx opennextjs-cloudflare build` + `npx wrangler deploy --keep-vars`(`--keep-vars` 保护 secrets 不被 wrangler.jsonc 反向覆盖)
- 当前线上 Version ID:`ebb93a85-a0d8-4c69-a8e0-4e3a49a9359e`
- 入口:
  - `https://ai-product-image-tool.penghui0809.workers.dev`(海外可达)
  - `app.zdatalink.cn`(等 zone Active 后生效)

### 7. 端到端验证通过
- 5 步流程:输入 → 分析中 → 确认方案 → 生成中 → 完成,全部跑通
- 3 张图全部稳定生成
- 串行 + 2.5s gap 让总耗时 ~35-50s(并发时 ~15-20s),换来零 429

## 关键技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| Anthropic 端点 | 诗云中转(`https://shiyunapi.com`) | 复用既有诗云余额,人民币付费 |
| Analyze 模型 | `claude-sonnet-4-5-20250929` | 诗云目录里没有 4-5 opus,sonnet 4.5 对结构化视觉够用 |
| 配置存放 | base URL 进 `wrangler.jsonc` `vars` 段 | 进 Git 可审计,deploy 不会意外抹掉;只有 API key 留 secret |
| 生成并发度 | 串行 + 2.5s gap | 稳定性 > 速度,Replicate per-second 限流不可控 |
| 429 重试 | 额外 1 次,不占常规 retry 配额 | 限流需要更长 backoff,不能跟 5xx 共用同一池 |

## 当前 Commit 链

```
135ed23 fix(generate): serialize 3-image generation and back off on 429
a1c985a fix(analyze): tolerate non-strict JSON from Shiyun proxy
575397d fix(analyze): switch model to claude-sonnet-4-5-20250929
94add16 chore(cf): pin ANTHROPIC_BASE_URL=https://shiyunapi.com in wrangler.jsonc
42d095e feat(analyze): support ANTHROPIC_BASE_URL for Shiyun proxy
dabaccb feat(ui): rewrite page.tsx as 5-step flow with split layout
b332e4c feat(api): add /api/analyze with Claude Opus 4.5 vision + json_schema
```

## 已知遗留 / 下一步

- `zdatalink.cn` Cloudflare zone 仍在等 NS 全网生效 → `app.zdatalink.cn` 入口暂不可用,以 `workers.dev` 为准
- Cloudflare Pages 项目 `ai-product-image-tool` 未删,每次 push 仍会触发它构建并失败(对 Worker 无影响,只是噪音)→ 待删
- Worker 还没接 Workers Builds 自动部署,push 后仍需手动 `wrangler deploy --keep-vars`
- 串行生成总耗时 ~35-50s,UI 没有进度条/预计时间 — 当前用户可见的是「第 1 张 done → 第 2 张 loading → 第 3 张 pending」的渐进效果,体验可接受但不够清晰

## 产品/工程洞察

- **代理 SDK 配置必须显式**:任何「走中转」的需求,SDK 初始化都要支持 `baseURL` 入参 + 环境变量,空值回落官方。这次踩的坑就是代码默认发往官方,塞错 key 还会被官方 401 拒
- **代理会静默丢未知字段**:诗云这类 OpenAI 兼容/Anthropic 兼容代理,通常只 forward 标准参数,`output_config` 这种新特性会被吃掉而不报错。**任何依赖 SDK 高级特性的逻辑,在代理后面都要做容错兜底**
- **限流是图像类 API 的常态**,不是异常路径:Replicate / OpenAI / Stability 都是 per-second 限流,客户端默认就该是「限并发 + 退避重试」,不要等出 429 再补
- **wrangler deploy 会反向覆盖 dashboard 配置**:`vars` 在本地不写就会被删,这个行为很容易踩雷。要么全部进 `wrangler.jsonc`,要么 deploy 时一律带 `--keep-vars`。secret 走的是另一通道,不受影响
