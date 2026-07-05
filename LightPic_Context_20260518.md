# LightPic 项目上下文文档 · 2026-05-18

## 1. 产品方向

### 一句话定位
**LightPic(轻图)** 是给中国电商卖家(尤其拼多多护肤品类)用的 AI 商品图生成工具:上传一张原图 → AI 自动识别产品 + 出方案 + 一键生成 3 张可商用的电商图。

### 解决谁的什么痛点

- **目标用户**:个体 / 中小拼多多卖家(护肤品起步,后续可扩美妆/食品/家居/服饰)
- **当前痛点**:
  - 商品图拍摄成本高(摄影棚 ¥500-2000/次,后期 ¥50-200/张)
  - 自学修图门槛陡,效率低
  - 通用 AI 工具(Midjourney / Sora / nano banana)不懂电商规范,出来的图不能直接用
- **LightPic 的差异化**:
  - 内置**拼多多平台规范**(尺寸 / 白底 / 文字水印规则),输出即可用
  - 内置**护肤品类视觉营销知识**(白底主图 / 场景生活图 / 细节特写图三件套),不需要用户懂运营
  - 中文交互、人民币付费(诗云中转)、国内可达(`app.zdatalink.cn`),不要求用户具备外网/支付国际服务的能力

### 不做什么(边界)
- 不做泛用「AI 修图」/「AI P 图」—— 我们只做「电商商品图生成 + 平台规范贴合」
- 不做素材库 / 模板库 —— 走「上传原图 → AI 出方案」的 zero-prep 路径
- 短期不做多平台扩展(淘宝 / 京东 / 抖音规范不同),先把拼多多护肤打透
- 不做企业级 SaaS,先做能让单个卖家直接用的工具

### 商业假设(待验证)
- 卖家愿意为「省下一次拍照的钱」付低单价(¥5-20/次生成,或包月)
- 拼多多护肤卖家的密度足够支撑 MVP 验证
- AI 成本 + 平台分账后,毛利可覆盖 Cloudflare Worker / Replicate / Anthropic 调用费

---

## 2. 技术架构

### 整体拓扑

```
┌─────────────┐    HTTPS      ┌────────────────────────────┐
│  浏览器     │ ───────────►  │  Cloudflare Worker         │
│  (Phoebe    │               │  ai-product-image-tool     │
│   测试中)   │ ◄───────────  │  workers.dev / app.zdatalink.cn │
└─────────────┘               └─────┬───────────────┬──────┘
                                    │               │
                          /api/analyze     /api/generate
                                    │               │
                                    ▼               ▼
                       ┌──────────────────┐  ┌────────────────┐
                       │ Shiyun (诗云)    │  │ Replicate      │
                       │ Anthropic 中转   │  │ flux-kontext-max│
                       │ shiyunapi.com    │  │ api.replicate  │
                       └─────────┬────────┘  └────────┬───────┘
                                 │                   │
                                 ▼                   ▼
                       ┌──────────────────┐  ┌────────────────┐
                       │ Anthropic 官方    │  │ Black Forest   │
                       │ Claude Sonnet 4.5│  │ Labs (FLUX)    │
                       └──────────────────┘  └────────────────┘
```

### 技术栈

| 层 | 技术 | 备注 |
|---|---|---|
| 前端 | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS | 单页 5-step 流程,客户端组件 |
| 后端 | Next.js Route Handlers (`/api/analyze`, `/api/generate`) | 跑在 Worker,Web 标准 `Request`/`Response` |
| 部署 | OpenNext + Cloudflare Workers | 不用 Pages,因为 OpenNext 是 Worker-first |
| 视觉理解 | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`),经诗云中转 | 用于 analyze:产品识别 + 卖点提炼 + 出图方案 |
| 图像生成 | `black-forest-labs/flux-kontext-max` 经 Replicate REST API | 用于 generate:基于原图做编辑式生成 |
| 域名/CDN | Cloudflare 标准边缘,主域 `zdatalink.cn` ICP 已备案(Phoebe 先生持有) | 国内访问通道:`app.zdatalink.cn` |
| 监控 | Cloudflare Logs(实时) + console.log 标签化 | 暂未接 Sentry/PostHog |

### 关键架构决策

| 决策 | 选项 | 选了什么 | 理由 |
|---|---|---|---|
| 部署平台 | Vercel / Cloudflare Workers / Cloudflare Pages | **Workers**(via OpenNext) | Vercel/Pages 在国内访问受限;Worker 备案后 + 自定义域名稳定面向国内 |
| Anthropic 端点 | 官方 / 诗云中转 | **诗云** | 复用现有诗云余额,人民币付费,国内调用稳定 |
| Analyze 模型 | Opus 4.7 / Sonnet 4.5 / Haiku 3 | **Sonnet 4.5** | 诗云目录里没有 Opus 4.5;Sonnet 4.5 对结构化视觉够用,成本/延迟更友好 |
| 图像模型 | flux-kontext-pro / flux-kontext-max / SDXL / DALL-E | **flux-kontext-max** | 编辑式生成保留产品本体效果最好;max 比 pro 质量更高 |
| 生成并发 | 3 张 `Promise.all` 并发 / 串行 | **串行 + 2.5s gap** | Replicate per-second 限流不可控,稳定性 > 速度 |
| 配置存放 | dashboard / wrangler.jsonc / .env | **base URL 进 wrangler.jsonc, key 进 secret** | base URL 不机密、要进 Git;key 必须 secret 通道 |
| HEIC 处理 | Web 端转码 / Worker 端转码 / 前端拒收 | **前端拒收 + 提示用户转 JPG** | libheif/sharp 在 Worker 边缘环境不带 HEVC,转码不可行 |

### 仓库 / 入口

- **Repo**: https://github.com/Phoebe0924/lightpic (public)
- **本地**: `/Users/pengpengsmac/Desktop/Guizhenglu_Lab/picset-mvp/`
- **生产 Worker**: https://ai-product-image-tool.penghui0809.workers.dev
- **国内入口**(等 zone Active):https://app.zdatalink.cn
- **当前线上 Version**: `ebb93a85-a0d8-4c69-a8e0-4e3a49a9359e`(2026-05-18 部署)

### 环境变量

| 变量名 | 在哪 | 类型 | 说明 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Cloudflare Worker Secret | Secret | 诗云 key,**不是**官方 Anthropic key |
| `ANTHROPIC_BASE_URL` | `wrangler.jsonc` 的 `vars` 段 | Plaintext(进 Git) | `https://shiyunapi.com` |
| `REPLICATE_API_TOKEN` | Cloudflare Worker Secret + 本地 `.env.local` | Secret | Replicate 官方 token |

---

## 3. 当前 SOP

### 用户使用流程(线上 5 步)

1. **输入** — 上传 JPG/PNG/WEBP 商品图(HEIC 会被前端拒收并提示)
2. **分析中** — 后端调 `/api/analyze` → Claude Sonnet 4.5 视觉分析,~15s
3. **确认方案** — 用户看到产品识别 / 3 个卖点 / 视觉风格 / 色彩系统 / 3 张图规划 / 拼多多平台规范,点「确认,开始生成」
4. **生成中** — 后端串行调 3 次 `/api/generate` → Replicate FLUX Kontext Max,每张 ~12s + 2.5s gap,总耗时 ~40-50s
5. **完成** — 3 张图九宫格展示,可单张下载或批量下载;支持单张失败不影响其他张,失败张可重试

### 开发流程

```bash
# 本地起服务
cd picset-mvp
npm run dev   # http://localhost:3000

# 改完代码先跑 typecheck + lint
npx tsc --noEmit
npx eslint src/

# commit + push
git add <files>
git commit -m "..."
git push

# 部署到 Cloudflare(必须用 --keep-vars 保护 secrets 不被反向覆盖)
npx opennextjs-cloudflare build
npx wrangler deploy --keep-vars
```

### Commit 规范

- 用 conventional commits:`feat`/`fix`/`chore`/`docs` + scope
- scope 用模块:`api` / `ui` / `analyze` / `generate` / `cf` / `model`
- body 写「为什么」,不只是「做了什么」
- 一个逻辑改动一个 commit,不要混合

### 排查线上问题的 SOP

1. 打开 Cloudflare Dashboard → Workers & Pages → `ai-product-image-tool` → **Logs** → **Live**
2. 在浏览器复现问题,日志窗口会实时滚出 `[analyze]` / `[generate]` 标签的诊断日志
3. 诊断关键字:
   - `[analyze] anthropic key present: true baseURL: https://shiyunapi.com` → 路由配置正确
   - `[analyze] succeeded in XXXX ms` → analyze 通了
   - `[generate] prediction created: <id> polling…` → Replicate 收到请求
   - `[generate] got 429 (rate limited), waiting 5s and retrying once` → 触发限流但已自动救
   - `[analyze] JSON parse failed. Full rawText below:` → 模型返回的不是合法 JSON,看 rawText 判断

### 安全 SOP

- 不在代码 / wrangler.jsonc / commit message 里出现任何 key
- 诗云 key、Replicate token 都走 Cloudflare Secret 通道
- `.env.local` 不进 Git(`.gitignore` 已配)
- 任何 deploy 必须带 `--keep-vars`,避免本地配置反向擦掉 dashboard 上的 secrets/vars

---

## 4. 用户反馈

> ⚠️ **诚实标注**:截至 2026-05-18,LightPic 还**没有外部真实用户**。以下「反馈」全部来自 Phoebe 作为产品+工程双角色的内部体验,以及代码 / 模型行为暴露出的产品工程认知。等到接外部测试用户后,这一节才会有真正的市场声音。

### 来自 Phoebe(内部测试)

- **5 步流程清晰好懂**:从上传到拿图,新手也知道每一步在做什么,不需要看说明书
- **「确认方案」步骤价值很大**:让用户看到 AI「读懂」了产品(产品类型 / 卖点 / 风格),才有信任感愿意往下走 —— 这一步是从纯生成工具升级为「营销助手」的关键
- **总耗时 35-50s 在心理上偏长**:并发改串行后稳定性大幅提升,但用户感知是「等很久」,需要更好的进度反馈(进度条 + 当前在做什么 + 预计剩余时间)
- **HEIC 拒收提示对 iPhone 用户不友好**:中国卖家相当比例用 iPhone 拍图直接上传,被拒后没有引导路径(不知道怎么转 JPG)

### 来自模型行为(代码暴露的产品认知)

- **flux-kontext-max 对「保留产品不变」类指令过度遵守**:命令式编辑指令(`Replace background with...`)效果远好于防御性指令(`Do not alter the product`)。已在 prompt 模板里固化为命令式
- **代理 API 会静默丢未知字段**:诗云这类兼容代理只 forward 标准参数,`output_config.format.json_schema` 这种新特性会被吃掉而不报错。任何依赖 SDK 高级特性的逻辑,在代理后面都要做容错兜底
- **限流是图像生成 API 的常态**:Replicate per-second 限流踩了一次。客户端默认应该是「限并发 + 退避重试」,不要等出 429 再补
- **模型版本目录会和供应商对齐**:诗云只暴露了 Claude 4.7 / Sonnet 4.5 / Haiku 3,官方的 Opus 4.5 不可用。任何模型选型都要先确认中转商支持

### 待获取(明确未知)

- 真实拼多多卖家拿到 3 张图的可用率(直接上架 vs 还要再 P)
- 真实卖家对 ¥5-20/次定价的接受度
- 不同护肤品类(面霜/精华/防晒/洁面)上 AI 出图质量的差异
- 国内不开 VPN 通过 `app.zdatalink.cn` 访问的实际延迟体验

---

## 5. 下一步计划

### 短期(1-2 周内,产品上线为目标)

| 优先级 | 项 | 说明 |
|---|---|---|
| P0 | 等 `zdatalink.cn` zone Active,验证 `app.zdatalink.cn` 国内可达性 | 不开 VPN 完整跑一次生成,确认延迟和稳定性 |
| P0 | 删除 Cloudflare Pages 项目 `ai-product-image-tool` | 消除每次 push 触发的失败构建噪音 |
| P1 | 接 Workers Builds 自动部署 | push 即上线;build & runtime env 都补齐 secrets |
| P1 | UI 文案统一 + 加进度条 | 把英文「Generating, this usually takes 10-30 seconds…」改中文,且耗时更新为 35-50s;「第 1 张完成 / 3 张」类进度提示 |
| P2 | HEIC 引导 | 拒收提示加一行「iPhone 用户:相册 → 共享 → 选 JPG」之类的引导文案,或者考虑加云端转码 |
| P2 | 删除阿里云遗留无效 CNAME | 清理脏配置 |
| P2 | README 链接更新到 `app.zdatalink.cn` | |

### 中期(1-2 月,产品验证为目标)

- **接 5-10 个真实拼多多护肤卖家测试**,收集:
  - 直接可用率(不需再 P)
  - 单图质量评分
  - 愿意付的价格
  - 最常见的失败类型(产品被改 / 风格不对 / 平台拒审)
- **加错误监控**(Sentry / PostHog),从「靠 Cloudflare Live Logs 排查」升级到「主动看趋势」
- **加用量统计 + 简单付费**(微信支付 / 支付宝),验证 ¥5-20/次的支付意愿
- **品类扩展**:在护肤品打透后,扩 1-2 个邻近品类(美妆 / 香水 / 个护)

### 长期(3-6 月,商业模式验证)

- **多平台规范**:淘宝 / 抖音 / 小红书的尺寸、白底、文案规则各自做适配
- **批量上传**:卖家一次传 10-50 张,排队生成
- **风格记忆**:卖家可以保存自己常用的「视觉风格」,下次直接套
- **决定融资 / 个体经营 / 项目封装**三选一 —— 取决于到那时数据是否支撑「一人公司」模型

### 已知技术债(择机偿还)

- `package.json` 的 `version` 还是 `0.1.0`,无版本管理
- 没有错误监控/分析,只能靠 Cloudflare 实时日志
- 串行生成耗时长,UI 没有真正的进度反馈
- 没接自动化 deploy,push 后仍需手动 `wrangler deploy --keep-vars`
- HEIC 边缘转码不可行,目前只能拒收

---

## 附录:关键文件位置(给未来的自己 / 协作者)

```
picset-mvp/
├── CLAUDE.md / AGENTS.md         # AI 协作指南,提醒 Next.js 16 是非通常版,改动前先看 node_modules/next/dist/docs/
├── wrangler.jsonc                # Worker 配置 + ANTHROPIC_BASE_URL
├── open-next.config.ts           # OpenNext 配置
├── package.json                  # @anthropic-ai/sdk ^0.96.0
├── src/app/page.tsx              # 5-step UI 主入口,~800 行
├── src/app/api/analyze/route.ts  # Claude Sonnet 4.5 视觉分析,带 JSON 容错
├── src/app/api/generate/route.ts # Replicate FLUX Kontext 生成,带 429 退避
├── LightPic_DevLog_20260518.md   # 今日详细技术日志
└── LightPic_Context_20260518.md  # 本文件
```

```
Guizhenglu_Lab/Journal/
└── 2026-05-18.md                 # 当日 Journal(精简版,5 个固定 section)
```

```
~/.claude/projects/-Users-pengpengsmac-Desktop-Guizhenglu-Lab/memory/
├── MEMORY.md                     # 索引
├── project_lightpic_state.md     # LightPic 项目状态(此文件维护更新源)
├── feedback_daily_journal.md     # Journal cadence
└── feedback_no_principles.md     # Phoebe 工作风格
```

---

**当前线上版本**:Worker `ebb93a85` · Code `135ed23` (2026-05-18)
**下次会议 / 评审建议关注**:`app.zdatalink.cn` 是否 Active,接外部测试用户的时机
