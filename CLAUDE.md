@AGENTS.md

# LightPic 项目上下文

> 详细文档见 `LightPic_Context_20260518.md` 和 `LightPic_DevLog_20260518.md`。本文件只放给 AI agent 看的最小上下文。

## 产品定位
**LightPic(轻图)**:为拼多多护肤品中小卖家做 AI 商品图生成工具。中文交互、人民币付费、国内可达。

## 当前状态

- **线上 URL**:https://ai-product-image-tool.penghui0809.workers.dev
- **国内入口**:https://app.zdatalink.cn
- **Vercel**:https://lightpic-mvp.vercel.app
- **当前流程**(5 步,按需生成):
  1. 上传图(JPG/PNG/WEBP,HEIC 拒收)
  2. OpenAI 视觉分析(产品识别 + 3 个卖点 + 视觉风格)
  3. 用户确认 brief 并选择业务目标
  4. 用户选择生成 1 / 2 / 4 张电商运营图
  5. 单张/批量下载

## 目标 SOP(下一步要演进到)

1. 上传图
2. AI 分析卖点
3. **用户编辑**(可改卖点 / 改风格 / 改图片规划)← 当前缺失
4. 按图片任务生成车图 / 商品首图 / 卖点图 / 质地图 / 场景图 / 详情页切片
5. 下载

也就是说,从「AI 全自动出方案 + 固定 3 张」演进到「人机协作出方案 + 一组图 + 文案」。

## 技术栈
- **前端**:Next.js 16 (App Router) + React 19 + TS + Tailwind
- **部署**:OpenNext + Cloudflare Workers
- **视觉理解**:默认 OpenAI Responses API(`OPENAI_ANALYZE_MODEL`,默认 `gpt-5.5`)
- **图像生成**:默认 OpenAI Images Edits(`OPENAI_IMAGE_MODEL`,默认 `gpt-image-2`)
- **兼容路径**:`ANALYZE_PROVIDER=anthropic` 可走 Anthropic;`IMAGE_PROVIDER=replicate|shiyun` 保留旧生成路径
- **域名**:`zdatalink.cn`(ICP 备案,Phoebe 先生持有)

## 下一步重点

1. **提示词编辑功能**:用户在「确认方案」步骤可改卖点 / 风格 / 每张图的 prompt
2. **生成一组图**:从固定 3 张改为 4-6 张,可选品类(白底/场景/特写/对比/使用中/细节微距等)
3. **配套文案输出**:Claude 同步给主图标题 / 卖点短句 / 详情页文案

## AI agent 工作时的关键提醒

- 当前中转站已不可用,不要默认走诗云。
- 本地和线上必须配置 `OPENAI_API_KEY` secret;不要把 key 写进 Git。
- `wrangler.jsonc` 只放非密钥 vars:`ANALYZE_PROVIDER=openai`,`IMAGE_PROVIDER=openai`,`OPENAI_ANALYZE_MODEL`,`OPENAI_IMAGE_MODEL`。
- 开发 UI 时可设置 `LIGHTPIC_DEV_MODE=1`,跳过真实图像 API。
- 部署用 `npx opennextjs-cloudflare build && npx wrangler deploy --keep-vars`,**`--keep-vars` 不能省**。
