import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `你是中国电商商品图营销专家,专门服务拼多多护肤品类卖家。

你的任务: 分析用户上传的护肤品产品图,输出一份完整的商品图生成方案。

输出要求:
1. product_type: 用中文识别产品类型(如"面霜"、"精华液"、"洁面"、"防晒"等)
2. visual_features: 用中文描述产品的视觉特征(包装颜色、瓶型、材质、质感)
3. selling_points: 提炼 3 个核心卖点,用拼多多用户能感知到的运营语言(如"温和不刺激、敏感肌可用"、"专研补水保湿、改善干燥"、"小巧便携、随身可用"),不要太抽象
4. visual_style: 用一句话定位整体视觉风格(如"清爽日系护肤风"、"高级精致科技护肤风"、"温柔少女氛围风")
5. color_system: 主色调描述,2-3 种颜色,用中文(如"米白色 + 浅木色 + 嫩芽绿")
6. image_plan: 3 张图片的具体规划,顺序固定:
   - 图1 白底主图 (用于拼多多搜索/列表展示,750×750 白底,产品居中)
   - 图2 场景生活图 (用于详情页氛围)
   - 图3 细节特写图 (用于突出卖点)

每张图必须包含:
- title: 中文标题(如"白底主图"、"场景生活图"、"细节特写图")
- purpose: 中文用途说明,一句话
- prompt: 英文 prompt,用于发给 image-edit 模型生成。重点强调"保留产品本体不变,只改变环境/光照/背景/构图",并融入上面识别到的视觉特征和风格定位。每条 prompt 80-150 词。`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    product_type: { type: "string" },
    visual_features: { type: "string" },
    selling_points: {
      type: "array",
      items: { type: "string" },
    },
    visual_style: { type: "string" },
    color_system: { type: "string" },
    image_plan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            enum: ["white-bg", "lifestyle-scene", "detail-closeup"],
          },
          title: { type: "string" },
          purpose: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["id", "title", "purpose", "prompt"],
      },
    },
  },
  required: [
    "product_type",
    "visual_features",
    "selling_points",
    "visual_style",
    "color_system",
    "image_plan",
  ],
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>): Response {
  console.error("[analyze] error", status, error, extra ?? {});
  return jsonResponse(status, { error, ...(extra ?? {}) });
}

export async function POST(req: Request): Promise<Response> {
  const t0 = Date.now();
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
    console.log(
      "[analyze] anthropic key present:",
      Boolean(apiKey),
      "baseURL:",
      baseURL ?? "(default api.anthropic.com)",
    );
    if (!apiKey) return jsonError(500, "Server is missing ANTHROPIC_API_KEY");

    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, "Invalid JSON body", { detail: String(e) });
    }
    const { imageDataUrl } = (body ?? {}) as { imageDataUrl?: unknown };
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonError(400, "Missing or invalid image");
    }

    const m = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return jsonError(400, "Could not parse image data URL");
    const mediaType = m[1];
    const base64 = m[2];
    const approxKB = Math.floor((base64.length * 3) / 4 / 1024);
    console.log("[analyze] image:", mediaType, `~${approxKB}KB`);

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return jsonError(400, `Unsupported media type: ${mediaType}`);
    }

    const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 },
            },
            {
              type: "text",
              text: "请分析这张护肤品产品图,按 schema 输出完整的商品图生成方案。",
            },
          ],
        },
      ],
    });

    console.log(
      "[analyze] usage:",
      JSON.stringify({
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read: response.usage.cache_read_input_tokens,
        cache_create: response.usage.cache_creation_input_tokens,
      }),
    );

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return jsonError(502, "Claude returned no text block");
    }

    let plan: unknown;
    try {
      plan = JSON.parse(textBlock.text);
    } catch (e) {
      console.error("[analyze] JSON parse failed, raw:", textBlock.text.slice(0, 500));
      return jsonError(502, "Claude returned invalid JSON", { detail: String(e) });
    }

    console.log("[analyze] succeeded in", Date.now() - t0, "ms");
    return jsonResponse(200, { plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof Anthropic.APIError) {
      console.error("[analyze] Anthropic API error:", err.status, err.type, err.message);
      return jsonError(err.status ?? 502, `Claude API error: ${err.message}`, {
        type: err.type,
      });
    }
    console.error("[analyze] uncaught:", message, err instanceof Error ? err.stack : undefined);
    return jsonResponse(500, { error: message });
  }
}
