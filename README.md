# LightPic 轻图

LightPic 是一个面向中小电商卖家的 AI 运营图工作台。用户上传一张商品图，AI 先识别商品并生成 Brief，再按运营目标生成一组可复核的商品图。

当前主要支持护肤品与美妆商品，核心不是“换一种风格”，而是先定义图片承担的销售任务：

- 提升点击：适合搜索、推荐和车图
- 讲清卖点：适合轮播图和详情页
- 增强信任：适合场景图和质感图

## 当前能力

1. 上传 JPG、PNG 或 WEBP 商品图
2. 使用 OpenAI Responses API 分析商品与卖点
3. 用户确认商品 Brief 和业务目标
4. 并发生成 4 张运营图，每次请求错开 500ms
5. 单张预览、重试和下载
6. 开发测试模式下返回占位图，不消耗图片 API

## 技术栈

- Next.js 16 App Router
- React 19、TypeScript、Tailwind CSS v4
- OpenAI Responses API
- OpenAI Images Edits API
- OpenNext + Cloudflare Workers
- Vercel Functions（固定区域 AI 后端）

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中填写 `OPENAI_API_KEY`。只调试界面时保留：

```env
LIGHTPIC_DEV_MODE=1
```

需要验证真实生成时改为：

```env
LIGHTPIC_DEV_MODE=0
```

## 验证

```bash
npx tsc --noEmit
npm run build
```

批量质量评测：

```bash
node scripts/eval-main-image.mjs
```

真实评测输入和生成结果不会提交到 Git。

## 部署结构

Cloudflare Workers 承载公开入口。为避免边缘节点出站区域导致 OpenAI 地区限制，AI API 可通过 `LIGHTPIC_API_ORIGIN` 转发到固定在 `iad1` 的 Vercel Functions。

部署密钥只配置在 `.env.local`、Cloudflare Secret 或 Vercel Environment Variables 中，不写入仓库。

## 当前边界

- 生成结果必须人工复核商品结构、包装文字、品牌标识和功效文案。
- `¥1.99` 当前是产品验证文案，尚未接入正式支付。
- 公开推广前仍需增加鉴权、限流和用量控制，避免 API 余额被滥用。
- 当前仓库保持 Private，作为下一轮产品迭代基线。
