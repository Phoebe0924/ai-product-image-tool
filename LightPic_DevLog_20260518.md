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

---

# LightPic 开发进度日志 · 2026-06-05

本次 session 的主线:把 LightPic 从「固定出 4 张商品图」推进到「按电商运营目标生成图片」,并建立一套可复测的质量评估流程。

## 起点状态

- 本地和线上已经能跑完整 5 步流程
- Canvas 左文右图布局 Stage 1 已上线
- 线上 Cloudflare Workers 和 Vercel 都已恢复到较新版本
- 产品问题变得清晰:继续生成白底主图价值不高,因为用户输入本来就是白底图
- 真实运营价值更可能来自车图、卖点图、场景图,目标是帮助商家提升点击、讲清卖点、增强信任

## 今日完成

### 1. 产品方向调整:从“输出用途”改成“业务目标”

原先思路容易把 4 张图固定成「主图 / 细节图 / 场景图 / 礼盒图」一类用途,但这对不同产品不成立。例如不是所有产品都有礼盒包装,也不是所有产品都适合浴室或户外场景。

调整后前端使用 3 个业务目标:

- `讲清卖点`:适合轮播 / 详情页,让用户知道为什么买
- `提升点击`:适合搜索 / 推荐 / 车图,第一眼要抓人
- `增强信任`:适合场景 / 质感图,让商品看起来可信

默认目标改为 `讲清卖点`。这是目前最稳的默认值:既有运营价值,又比“提升点击”更少诱发夸张文案和违规背书。

### 2. 生成数量和生成方式

- 取消默认白底主图和细节特写图
- 目标改为生成 4 张电商运营图
- 前端使用简单并发方案:
  - `Promise.all` 并发调用 4 次 `generateOne`
  - 每次启动错开 500ms
  - 不改 `/api/generate` 路由,避免后端范围扩大

### 3. Analyze 侧动态规划原则

产品决策:4 个场景不硬编码。Claude 分析商品之后,应根据商品类型、包装形态、卖点和电商目标动态规划更适合的 4 张图。

明确避免:

- 默认桌面 / 户外 / 浴室 / 礼盒四件套
- 对没有礼盒的产品强行生成礼盒包装
- 对不适合真人/功效对比的产品强行做结果证明

保留方向:

- 3 个稳定场景 + 1 个挑战场景
- 实测后再决定是否收紧挑战场景

### 4. Generate prompt 按业务目标分支

`/api/generate` 开始接收:

- `outputUse`
- `outputMode`
- `platform`

Prompt 分支:

- `outputMode === "visual"`:生成纯视觉图,不加文字、徽章、水印,留出后期叠字空间
- `outputUse === "selling-point"`:偏卖点解释和购买理由,适合轮播 / 详情页
- `outputUse === "scene"`:偏场景、质感和可信度,减少文字
- 默认 `traffic`:偏点击吸引和搜索推荐位视觉冲击

### 5. 风险文案 guard

新增风险约束,默认不生成未核验的信任背书:

- 官方正品
- 正品保证
- 品质保证
- 放心购买
- 敏感肌可用
- 医美
- 美白
- 祛斑
- 祛痘
- 临床认证

原因:这些词在电商运营里很常见,但对真实商家来说风险很高。LightPic 当前不能替用户验证资质,所以默认不应该生成这类承诺。

### 6. 开发测试模式

增加环境变量控制的测试模式:

- 测试模式下跳过真实图像模型调用
- 直接返回固定占位图
- 用于开发 UI、流程、下载、布局时不消耗真实 API
- 最终质量验证时再切回真实模式

### 7. Canvas 背景色从产品主色提取

Canvas 背景色改为从产品原图提取主色,不再写死固定背景色。

目标:

- 粉色包装更容易获得粉色氛围
- 紫色 / 金色 / 棕色包装不再被统一套成同一套米色底
- 让结果更像根据商品定制,而不是同一个模板换图

### 8. 建立评测目录和脚本

新增评测输入目录:

```text
eval-inputs/
```

用户放入 10 张真实测试商品图,覆盖防晒、隔离、粉底、卸妆油、儿童面霜等。

新增评测脚本:

```text
scripts/eval-main-image.mjs
```

脚本能力:

- 批量读取 `eval-inputs/`
- 调用本地 `/api/analyze`
- 调用本地 `/api/generate`
- 保存输出到 `eval-runs/<timestamp>/`
- 支持 matrix mode:代表商品 × 业务目标

### 9. 完成两轮评测

#### Baseline eval

- 输入:10 张商品图
- 成功率:10/10
- 主要问题:
  - 图像有电商感,但文字由模型直接生成时容易不可控
  - 容易生成「官方正品 / 品质保证」等默认信任背书
  - 个别产品识别和包装保真仍有风险

#### Matrix eval

- 输入:4 个代表商品 × 3 个业务目标 = 12 张图
- 成功率:12/12
- 结论:
  - `讲清卖点` 最适合作为默认目标
  - `提升点击` 更抓眼,但更容易带来夸张和风险文案
  - `增强信任` 画面更干净,但商业信息弱
  - 默认文案必须收紧,尤其是官方 / 正品 / 品质保证类词

## 验证

```bash
npx tsc --noEmit
npm run build
```

均通过。

## 产品判断

这轮之后,LightPic 的核心不应再描述为「AI 主图生成器」,而应描述为:

**按运营目标生成电商图片的工作台。**

主图如果只是白底,对用户价值不明显。真正值得继续打磨的是:

- 车图:帮助提升点击
- 卖点图:帮助讲清为什么买
- 场景图:帮助增强可信度

## 已知遗留

- 需要做 post-fix 小样本复测,确认风险词 guard 真的降低「官方正品 / 品质保证」出现率
- 评测图片和生成结果不建议直接进 Git,应只提交脚本和 README
- 支付 / 留资入口还未做
- 方案确认步骤已有文案展示,但还需要更完整的文案编辑能力

---

# LightPic 开发进度日志 · 2026-06-07

本次 session 的主线:把「朋友建议做付费接口」转译为更小的产品验证动作:先做 `¥1.99` 付费试用入口,不先做完整 API / 计费 / 鉴权系统。

## 起点状态

- LightPic 已具备本地生成和线上部署基础
- 生成质量正在从“能出图”走向“对运营有帮助”
- 用户提出:朋友问为什么不做一个付费接口,丢出去让别人试一下

## 产品判断

不建议现在做“付费接口”。

原因:

- API 产品需要鉴权、文档、调用额度、计费、失败重试、稳定性承诺
- 当前真正未验证的是运营用户是否愿意为“一组可用商品图”付费
- 过早做接口会把团队拖进工程复杂度,但不能直接回答商业验证问题

更小的验证动作:

**做一个 `¥1.99` 付费试用入口,卖 1 组 4 张电商运营图。**

## 今日完成

### 1. 新增试用价常量

在 `src/app/page.tsx` 增加:

```ts
const TRIAL_PRICE = "¥1.99";
```

### 2. 首页首屏加入试用 CTA

首屏新增:

- `¥1.99 试用 1 组图`
- `先验证运营效果，再决定是否批量使用`
- CTA 从 `开始生成` 改为 `¥1.99 开始试用`

### 3. 上传卡片加入试用提示

上传区域新增:

- `¥1.99 试用` badge
- 说明文案:

```text
试用价 ¥1.99：生成 1 组 4 张电商运营图，适合先测试车图、卖点图和场景图方向。
```

### 4. 首屏价值表达微调

首页文案从泛泛的「生成一套电商视觉方案」进一步收敛为:

- AI 分析商品特征和卖点
- 按提升点击、讲清卖点、增强信任生成 4 张可下载商品图
- 先用低价试用判断是否值得继续优化

## 验证

```bash
npx tsc --noEmit
npm run build
```

均通过。

## 当前未做

- 未接支付系统
- 未接微信 / 表单 / 二维码
- 未部署本次 `¥1.99` 文案到线上

## 下一步

1. 给 `¥1.99` CTA 接一个最小收款 / 留资路径
2. 优先考虑微信收款码、飞书表单或加微信,不要先做复杂支付系统
3. 让 3 个真实运营用户试付费
4. 根据付款前后的行为判断:用户卡在价格、信任、上传流程,还是生成结果质量

---

# LightPic 开发进度日志 · 2026-06-16

本次 session 的主线:中转站不可用后,把 LightPic 默认模型链路切到官方 OpenAI API,避免产品因为 Shiyun 挂掉而整体不可用。

## 起点状态

- `/api/analyze` 默认依赖 `ANTHROPIC_BASE_URL=https://shiyunapi.com`
- `/api/generate` 主链路依赖 Shiyun `gpt-image-2`
- `/api/test-image` 也是 Shiyun 专用测试路由
- `.env.local` 和 `wrangler.jsonc` 都还指向中转站
- 中转站挂掉后,线上分析和生成都会受影响

## 今日完成

### 1. Analyze 默认切到 OpenAI Responses

- 新增 OpenAI Responses 调用路径
- 默认 `ANALYZE_PROVIDER=openai`
- 默认模型 `OPENAI_ANALYZE_MODEL=gpt-5.5`
- 继续保留 `ANALYZE_PROVIDER=anthropic` 兼容路径
- Anthropic 官方调用使用 `x-api-key` + `anthropic-version`
- Shiyun / 其他 bearer 代理仅在设置 `ANTHROPIC_BASE_URL` 时使用 bearer auth

### 2. Generate 默认切到 OpenAI Images Edits

- 新增官方 OpenAI `/v1/images/edits` 调用路径
- 默认 `IMAGE_PROVIDER=openai`
- 默认模型 `OPENAI_IMAGE_MODEL=gpt-image-2`
- multipart 字段使用官方 `image[]`
- 返回值兼容 `data[0].url` 和 `data[0].b64_json`
- 保留旧兼容路径:`IMAGE_PROVIDER=replicate|shiyun`

### 3. Test Image 路由切官方

- `/api/test-image` 从 Shiyun 专用测试改为 OpenAI 官方测试
- 使用 `OPENAI_API_KEY`
- 使用 `OPENAI_IMAGE_MODEL`
- endpoint 默认 `https://api.openai.com/v1/images/edits`

### 4. 环境变量配置

`wrangler.jsonc` 移除:

```json
"ANTHROPIC_BASE_URL": "https://shiyunapi.com"
```

新增非密钥 vars:

```json
"ANALYZE_PROVIDER": "openai",
"IMAGE_PROVIDER": "openai",
"OPENAI_ANALYZE_MODEL": "gpt-5.5",
"OPENAI_IMAGE_MODEL": "gpt-image-2"
```

`.env.local` 改为官方 OpenAI 变量结构:

```env
ANALYZE_PROVIDER=openai
IMAGE_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_ANALYZE_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
LIGHTPIC_DEV_MODE=0
```

真实密钥仍需单独填入本地 `.env.local` 和线上 secrets,不能写进 Git。

### 5. 线上 Secret 与部署

用户将官方 `OPENAI_API_KEY` 填入本地 `.env.local` 后,继续完成线上配置:

- Cloudflare Worker secret 写入 `OPENAI_API_KEY`
- Vercel production env 写入 `OPENAI_API_KEY`
- Cloudflare Worker 重新部署
- Vercel production 重新部署

Cloudflare 部署结果:

```text
https://ai-product-image-tool.penghui0809.workers.dev
https://app.zdatalink.cn
Version ID: d6919cb2-081e-4cbe-900a-1ba16b6e7fa8
```

Vercel 部署结果:

```text
https://lightpic-mvp.vercel.app
https://lightpic-l1qwkl3jf-penghui0809-9334s-projects.vercel.app
Deployment ID: dpl_5dW7i4nrHpxeprTd3ZTpc73MeG2A
```

### 6. Vercel 上传失败排查

第一次 Vercel 部署失败:

```text
FetchError: request to https://api.vercel.com/v2/files failed, reason: write EPIPE
```

排查发现项目没有 `.vercelignore`,本地存在较大的 `.next`、`.open-next`、`node_modules`、`eval-runs` 等目录。Vercel CLI 上传包一度超过 70MB,网络上传阶段中断。

新增 `.vercelignore`,排除本地构建产物、依赖目录和评测产物:

```text
.next
.open-next
.wrangler
node_modules
eval-runs
eval-inputs/*
!eval-inputs/README.md
*.tsbuildinfo
.DS_Store
```

加完后 Vercel 上传包降到 `111B`,production 部署成功。

## 验证

```bash
npx tsc --noEmit
npm run build
npx opennextjs-cloudflare build
npx wrangler deploy --keep-vars
npx vercel --prod --scope penghui0809-9334s-projects
```

均通过。

线上真实测试:

- 用户在 Cloudflare Workers 地址完成一次真实生成测试
- 截图显示防晒商品图成功生成
- 说明官方 OpenAI API 主链路已经恢复线上可用

## 待完成

- 观察官方 API 成本和生成成功率
- 增加基础防刷/限额策略,避免公开入口快速消耗 API 余额
- 后续如需真实收费,把 `¥1.99` 入口接到收款或留资路径

---

# 2026-06-18 OpenAI 地区 403 修复

## 故障

Cloudflare 线上入口在分析商品时出现:

```text
unsupported_country_region_territory
Country, region, or territory not supported
```

原因不是商品图、模型或 API Key 错误,而是 Cloudflare Worker 会在靠近访问者的边缘节点运行。OpenAI 可能将该节点的出站区域判断为不支持区域,导致同一版本此前成功、之后又返回 403。

## 修复

- 保留 Cloudflare Workers 和 `app.zdatalink.cn` 作为用户入口。
- 新增 `LIGHTPIC_API_ORIGIN=https://lightpic-mvp.vercel.app`。
- Cloudflare 的 `/api/analyze` 和 `/api/generate` 转发到 Vercel。
- Vercel API 路由设置 `preferredRegion = "iad1"`,再由固定的美国华盛顿区域调用 OpenAI。
- 增加自我转发保护,避免 Vercel 环境误配置时形成递归请求。
- 将 OpenAI 地区限制和网络错误转换为中文通用提示,不再向前端暴露原始供应商 JSON。

## 部署

Vercel:

```text
Production: https://lightpic-mvp.vercel.app
Deployment ID: dpl_53tENBGmVmCpj2k2QFtkb6MxUnD8
Region: iad1
```

Cloudflare:

```text
https://ai-product-image-tool.penghui0809.workers.dev
https://app.zdatalink.cn
Version ID: e64a817a-e81b-43b7-a67a-581e32c30f7d
```

## 验证

- `npm run build`:通过。
- `npx tsc --noEmit`:通过。
- 本次改动文件定向 ESLint:0 errors。
- Vercel `/api/analyze` 空请求:400,响应执行链显示 `iad1`。
- Cloudflare `/api/analyze` 空请求:400,转发响应正常。
- 使用现有防晒霜测试图调用 Cloudflare 线上分析 API:200,成功返回商品 Brief,地区 403 已消失。

全仓库 `npm run lint` 仍会扫描 `.open-next` 生成文件,并命中页面中已有的 React lint 问题;不是本次修复引入。

---

# 2026-06-23 GitHub 基线整理

## 目的

在进入下一轮产品迭代前,先把当前线上能力整理成可追溯、可构建、可继续开发的 GitHub 基线。

## 修正

- 发现文档长期写着“并发生成 4 张”,但正式按钮实际只调用一次 `generateOne`。
- 正式流程改为 `Promise.all` 生成 4 张,每个请求错开 500ms 启动。
- 每张结果独立更新状态,单张失败时只重试对应位置。
- 恢复“下载全部”入口。
- 移除页面中未使用组件和不必要的 mounted 状态,消除相关 React lint 错误。

## 仓库整理

- README 从 Next.js 默认模板改为 LightPic 项目说明。
- 新增 `.env.example`,只包含变量名和安全默认值。
- `.gitignore` 排除 `eval-runs/` 和真实评测商品图,保留 `eval-inputs/README.md`。
- 真实 API Key 继续只存在于本地和部署平台 Secret。
- GitHub 仓库保持 Private,本次只建立下一轮迭代基线,不直接公开源码。
