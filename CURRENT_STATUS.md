# LightPic — Current Status

> Last updated: 2026-06-24

## 当前阶段

**付费试用验证中** — LightPic 已从「AI 商品图工作台 demo」推进到「低价付费试用入口」阶段。当前重点不是搭完整支付系统，而是验证运营用户是否愿意为 1 组可用电商图付费。

## 当前线上状态

| 环境 | URL | 状态 |
|---|---|---|
| Cloudflare Workers | `https://ai-product-image-tool.penghui0809.workers.dev` | 已部署最新稳定版本 |
| 自定义域名 | `https://app.zdatalink.cn` | 已指向 Cloudflare Worker |
| Vercel | `https://lightpic-mvp.vercel.app` | 已恢复部署 |

说明：`¥1.99` 试用文案、官方 OpenAI API 和固定区域 Vercel 后端均已部署。正式支付、鉴权和用量控制仍未接入。

## 当前产品路径

1. 用户上传商品白底图或简单背景图
2. OpenAI 分析商品类型、外观特征、卖点和视觉方向
3. 用户确认 brief，并选择业务目标
4. 用户选择生成 1、2 或 4 张；多张时前端并发触发 `generateOne`，错开 500ms 启动
5. `/api/generate` 调用 OpenAI Images Edits / `gpt-image-2` 或测试占位图，按用户选择返回 1、2 或 4 张商品运营图
6. 用户下载图片，人工复核商品主体、品牌文字和功效文案

## 当前产品定位

LightPic 不再优先做「白底主图生成」。因为用户输入通常已经是白底商品图，重复生成白底图价值有限。

当前更准确的定位是：

**面向电商运营的小工具：上传一张商品图，按业务目标生成车图、卖点图、场景图等可复核运营图。**

默认业务目标：`讲清卖点`。

可选业务目标：

- `讲清卖点`：适合轮播 / 详情页，让用户知道为什么买
- `提升点击`：适合搜索 / 推荐 / 车图，第一眼要抓人
- `增强信任`：适合场景 / 质感图，让商品看起来可信

## 2026-06-05 已完成

### 1. 生成方向从固定用途改为业务目标

- 移除“所有产品都固定桌面 / 户外 / 浴室 / 礼盒”等硬编码思路
- 改为让 Claude 根据产品类型动态规划更合适的场景和表达
- 前端加入 `业务目标` 控件，默认 `讲清卖点`
- `/api/generate` 接收 `outputUse`、`outputMode`、`platform`

### 2. 4 张图生成链路调整

- 取消白底主图和细节特写图作为默认强制产物
- 生成目标改为 4 张电商运营图
- 前端使用简单并发方案：`Promise.all` 触发 4 次 `generateOne`，每次错开 500ms
- 未改 `/api/generate` 路由结构，降低后端风险

### 3. 开发测试模式

- 增加环境变量控制的测试模式
- 测试模式下跳过真实图像模型调用，直接返回固定占位图片
- 目的：开发 UI 和流程时不烧 API 额度，最终验证时再打开真实模式

### 4. Canvas 背景色

- Canvas 背景色改为从产品原图主色提取
- 不再写死米色 / 灰色背景
- 目标：让结果更贴合商品包装色彩，不出现所有商品同一套底色的问题

### 5. 质量评估

- 建立 `eval-inputs/` 输入目录
- 建立 `scripts/eval-main-image.mjs` 评测脚本
- 跑过 10 张商品图 baseline 和 4 个代表商品 × 3 个业务目标 matrix eval
- 结论：`讲清卖点` 是当前最适合作为默认目标的方向；`提升点击` 更刺激但更容易产生高风险信任文案；`增强信任` 更干净但商业信息不足

### 6. 风险文案约束

- `/api/generate` 增加风险 guard
- 默认禁止生成未核验的「官方正品」「品质保证」「放心购买」等信任背书
- 默认禁止敏感功效词：医美、美白、祛斑、祛痘、临床认证等

## 2026-06-07 已完成

### 付费试用入口

- 新增 `TRIAL_PRICE = "¥1.99"`
- 首页首屏加入 `¥1.99 试用 1 组图`
- CTA 改为 `¥1.99 开始试用`
- 上传卡片加入 `¥1.99 试用` badge
- 上传区说明改为：试用价生成 1 组 4 张电商运营图，适合测试车图、卖点图和场景图方向

当前还没有接支付系统。产品决策是先验证付费意愿，不先做复杂 API / 鉴权 / 订阅 / 支付工程。

## 2026-06-16 已完成

### 官方 OpenAI API 切换

- 中转站已不可用,默认链路从 Shiyun 切到官方 OpenAI API
- `/api/analyze` 默认使用 OpenAI Responses API
- `/api/generate` 默认使用 OpenAI Images Edits
- `/api/test-image` 从 Shiyun 测试页改成 OpenAI 测试页
- `wrangler.jsonc` 移除 `ANTHROPIC_BASE_URL=https://shiyunapi.com`
- `wrangler.jsonc` 新增非密钥 vars:
  - `ANALYZE_PROVIDER=openai`
  - `IMAGE_PROVIDER=openai`
  - `OPENAI_ANALYZE_MODEL=gpt-5.5`
  - `OPENAI_IMAGE_MODEL=gpt-image-2`
- `.env.local` 已改成官方 OpenAI 变量结构,本地 `OPENAI_API_KEY` 已填入
- Cloudflare Worker secret 已写入 `OPENAI_API_KEY`
- Vercel production env 已写入 `OPENAI_API_KEY`
- Cloudflare 已重新部署:
  - `https://ai-product-image-tool.penghui0809.workers.dev`
  - `https://app.zdatalink.cn`
  - Version ID: `d6919cb2-081e-4cbe-900a-1ba16b6e7fa8`
- Vercel production 已重新部署:
  - `https://lightpic-mvp.vercel.app`
  - Deployment: `https://lightpic-l1qwkl3jf-penghui0809-9334s-projects.vercel.app`
- 用户已完成线上真实测试,截图显示商品图生成成功
- 保留旧兼容路径:`ANALYZE_PROVIDER=anthropic`,`IMAGE_PROVIDER=replicate|shiyun`

## 验证记录

最近本地验证通过：

```bash
npx tsc --noEmit
npm run build
npx opennextjs-cloudflare build
npx wrangler deploy --keep-vars
npx vercel --prod --scope penghui0809-9334s-projects
```

线上验证:

- Cloudflare Workers 真实生成测试成功
- 结果截图显示防晒商品图生成成功,说明官方 OpenAI API 主链路可用

## 2026-06-23 基线整理

- 修正正式生成按钮只出 1 张的问题
- 正式流程改为并发生成 4 张,每次启动错开 500ms
- 单张失败或不满意时可只重试对应结果位
- 增加 `.env.example`
- `eval-runs/` 和真实评测商品图不进入 Git
- README 从 Next.js 默认模板改为 LightPic 项目说明
- GitHub 仓库继续保持 Private,作为下一轮迭代基线

后续修正:生成数量不再固定为 4 张。用户可选 1 / 2 / 4 张,默认 1 张,多张时仍错开 500ms 并发。

## 2026-06-24 公开试用保护

- Cloudflare 原生 Rate Limit binding 已配置:分析每分钟 5 次,生成每分钟 8 次
- Vercel 后端增加并验证代理请求兜底限流:分析每分钟 5 次,生成每分钟 8 次
- 用户可选 1 / 2 / 4 张;选择 4 张时需要 4 次生成请求
- 超限返回中文提示和 `Retry-After: 60`
- Cloudflare 到 Vercel 使用 `LIGHTPIC_PROXY_SECRET`,阻止绕过正式入口直接调用 Vercel API
- 上传图片前后端统一限制为 2MB
- `/api/test-image` 默认在生产环境关闭
- 2026-06-24 线上空请求压测中 Cloudflare 原生 binding 未触发 429;当前以 Vercel 兜底限流作为已验证保护。
- 最新 Cloudflare Worker Version ID:`22326a2f-8e52-40ea-85d0-efe02f1f1da7`
- 最新 Vercel Production Deployment ID:`dpl_7iZ4swAFssoz86HCBunm4Hr9vCKc`

## 下一步建议

1. 给 `¥1.99` CTA 接一个最小收款 / 留资路径：微信收款码、表单或加微信均可
2. 用 2 个商品做 post-fix 复测，确认高风险信任文案已经明显减少
3. 只提交代码、脚本和必要 README；原始评测图和生成结果建议不进 Git
4. 找 3 个真实运营用户试付费，不急着做正式 API
5. 增加基础成本/防刷控制,避免公开试用入口消耗过快
