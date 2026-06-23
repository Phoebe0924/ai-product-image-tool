# LightPic — Project Context

> Last updated: 2026-06-23

## 产品定位

**LightPic（轻图）** — AI 电商运营图工作台。面向拼多多 / 淘宝等中小商家,上传一张商品图,按业务目标生成车图、卖点图、场景图等可复核的商品运营图。中文交互,国内可达,人民币付费。

当前验证方向:先做 `¥1.99` 付费试用入口,卖 1 组 4 张图,不先做完整 API / 会员 / 支付系统。

## 线上地址

| 环境 | URL |
|------|-----|
| Cloudflare Workers（主力） | https://ai-product-image-tool.penghui0809.workers.dev |
| 国内入口 | https://app.zdatalink.cn |
| Vercel | https://lightpic-mvp.vercel.app |

说明:`¥1.99` 试用文案、官方 OpenAI API 和固定区域 Vercel 后端已经部署。支付、鉴权和用量控制尚未接入。

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4
- **部署**: OpenNext + Cloudflare Workers + Vercel
- **AI 视觉分析**: 默认 OpenAI Responses API (`OPENAI_ANALYZE_MODEL`,默认 `gpt-5.5`)
- **图像生成**: 默认 OpenAI Images Edits (`OPENAI_IMAGE_MODEL`,默认 `gpt-image-2`)
- **兼容路径**: `ANALYZE_PROVIDER=anthropic` 可走 Anthropic;`IMAGE_PROVIDER=replicate|shiyun` 保留旧生成路径
- **测试模式**: 环境变量控制,可跳过真实图像模型并返回固定占位图
- **Canvas 辅助**: 产品主色提取 / 前端结果展示
- **域名**: `zdatalink.cn`（ICP 备案）

## 关键技术约束

1. 中转站已不可用,默认不要走诗云。
2. 本地和线上必须配置 `OPENAI_API_KEY`;密钥只放 `.env.local` 或平台 secret,不要进 Git。
3. 当前前端用简单并发方案生成 4 张图:`Promise.all` + 每次 `generateOne` 错开 500ms
4. 开发 UI 时优先打开测试模式,避免烧真实图像 API
5. 部署 Cloudflare 命令：`npx opennextjs-cloudflare build && npx wrangler deploy --keep-vars`（`--keep-vars` 不能省）
6. 默认禁止生成未经核验的「官方正品 / 品质保证 / 放心购买」等信任背书

## 当前产品流程（5 步）

1. 上传商品图（JPG/PNG/WEBP，拒收 HEIC）
2. OpenAI 视觉分析（产品识别 + 卖点 + 视觉风格）
3. 用户确认方案并选择业务目标
4. 生成 4 张电商运营图
5. 单张/批量下载

## 当前业务目标

默认目标:`讲清卖点`

可选目标:

- `讲清卖点`:适合轮播 / 详情页,让用户知道为什么买
- `提升点击`:适合搜索 / 推荐 / 车图,第一眼要抓人
- `增强信任`:适合场景 / 质感图,让商品看起来可信

## 核心文件

| 文件 | 说明 |
|------|------|
| `src/app/page.tsx` | 主 UI，工作台、业务目标、试用入口 |
| `src/app/globals.css` | 中文字体栈、skeleton shimmer、light-mode only |
| `src/app/api/analyze/route.ts` | 视觉分析接口,默认 OpenAI Responses,可显式切 Anthropic |
| `src/app/api/generate/route.ts` | 图像生成接口,默认 OpenAI Images Edits,含测试模式和风险词 guard |
| `scripts/eval-main-image.mjs` | 批量评测脚本 |
| `eval-inputs/README.md` | 评测输入目录说明 |
| `CLAUDE.md` | AI agent 工作上下文（最小版） |
| `LightPic_Context_20260518.md` | 完整产品上下文文档 |
| `LightPic_DevLog_20260518.md` | 开发日志 |
| `CURRENT_STATUS.md` | 当前状态、已完成、下一步 |
