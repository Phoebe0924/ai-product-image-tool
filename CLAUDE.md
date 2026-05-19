@AGENTS.md

# LightPic 项目上下文

> 详细文档见 `LightPic_Context_20260518.md` 和 `LightPic_DevLog_20260518.md`。本文件只放给 AI agent 看的最小上下文。

## 产品定位
**LightPic(轻图)**:为拼多多护肤品中小卖家做 AI 商品图生成工具。中文交互、人民币付费、国内可达。

## 当前状态(已上线)

- **线上 URL**:https://ai-product-image-tool.penghui0809.workers.dev
- **国内入口**:https://app.zdatalink.cn(等 zone Active)
- **当前流程**(5 步,固定 3 张):
  1. 上传图(JPG/PNG/WEBP,HEIC 拒收)
  2. Claude Vision 分析(产品识别 + 3 个卖点 + 视觉风格 + 色彩系统 + 图片规划)
  3. 用户**只能确认或重传**(目前不能编辑方案)
  4. 串行生成 3 张固定品类:白底主图 / 场景生活图 / 细节特写图(无文案)
  5. 单张/批量下载

## 目标 SOP(下一步要演进到)

1. 上传图
2. AI 分析卖点
3. **用户编辑**(可改卖点 / 改风格 / 改图片规划)← 当前缺失
4. 生成**一组 4-6 张**场景图 **+ 配套文案**(标题 / 卖点短句)← 当前是固定 3 张、无文案
5. 下载

也就是说,从「AI 全自动出方案 + 固定 3 张」演进到「人机协作出方案 + 一组图 + 文案」。

## 技术栈
- **前端**:Next.js 16 (App Router) + React 19 + TS + Tailwind
- **部署**:OpenNext + Cloudflare Workers
- **视觉理解**:Claude Sonnet 4.5(`claude-sonnet-4-5-20250929`),经**诗云中转**(`https://shiyunapi.com`),**不是**官方 Anthropic
- **图像生成**:`black-forest-labs/flux-kontext-max` 经 Replicate REST API
- **域名**:`zdatalink.cn`(ICP 备案,Phoebe 先生持有)

## 下一步重点

1. **提示词编辑功能**:用户在「确认方案」步骤可改卖点 / 风格 / 每张图的 prompt
2. **生成一组图**:从固定 3 张改为 4-6 张,可选品类(白底/场景/特写/对比/使用中/细节微距等)
3. **配套文案输出**:Claude 同步给主图标题 / 卖点短句 / 详情页文案

## AI agent 工作时的关键提醒

- 任何 Anthropic 调用都走诗云,不要硬编码官方端点;`new Anthropic({ apiKey, baseURL })` 必须支持环境变量 `ANTHROPIC_BASE_URL`
- 诗云会**静默丢弃** SDK 高级特性(如 `output_config.format.json_schema`),依赖这些特性的逻辑必须有 prompt 自约束 + 解析侧 fallback
- Replicate per-second 限流,生成多张图必须**串行 + gap**,不要 `Promise.all`
- 部署用 `npx opennextjs-cloudflare build && npx wrangler deploy --keep-vars`,**`--keep-vars` 不能省**(否则 dashboard 上的 secret/var 会被反向覆盖)
- 模型 ID 要对照诗云目录(`claude-opus-4-7` / `claude-sonnet-4-5-20250929` / `claude-3-haiku-20240307`),官方目录里的模型在诗云未必有
