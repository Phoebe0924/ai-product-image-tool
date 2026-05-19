import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `你是中国电商商品图营销专家,专门服务拼多多护肤品类卖家。

【非护肤品分支(必须先判断)】
如果用户上传的图片**不是护肤品**(护肤品包括:面霜、乳液、精华液、化妆水/爽肤水、洁面、防晒、面膜、眼霜、唇膏、护肤套装等),
请只输出以下格式的 JSON,不要做任何其他分析,也不要尝试硬套护肤品方案:

{"unsupported": true, "reason": "<一句中文说明,告诉用户检测到的是什么品类,以及目前 LightPic 只支持护肤品>"}

reason 示例:"检测到这是充电宝/数码周边类商品。LightPic 目前只支持护肤品类(面霜、精华、洁面、防晒等),其他品类我们正在筹备中,敬请期待。"

【护肤品分支】
如果是护肤品,按下面要求输出完整的商品图生成方案。

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
- prompt: 英文 prompt,用于发给 image-edit 模型生成。重点强调"保留产品本体不变,只改变环境/光照/背景/构图",并融入上面识别到的视觉特征和风格定位。每条 prompt 80-150 词。**关键:必须显式要求生成的底图不出现任何文字、标签、水印、文案叠加 (no text, no labels, no watermarks, no copy overlays, no Chinese characters in the scene)**,因为最终的中文标题和卖点会由前端 Canvas 在底图上叠加合成。

7. copy: 中文营销文案,用于前端 Canvas 在底图上叠加合成。必须包含以下字段:
   - main_title: 主标题,8-14 个汉字,营销冲击力强(如"防晒不透皮 温和不用卸"、"粉胶囊防晒 美白更稳白")
   - sub_title: 副标题,3-20 字,可含数字 / 英文 / 符号(如"SPF50+ PA++++"、"3.0 遇光更耐晒"、"专为户外场景设计")
   - bullets: 3 条勾选式短卖点,每条 4-8 个汉字(如["安全免渗透","水润无负担","特护敏感肌"])
   - side_badges: 2 个角标短句,每条 4-8 个汉字(如["光电后1天可用","免卸妆更护屏"])
   - new_badge: 1 个圆形 NEW 角标短句,3-8 字(如"NEW 光胶囊"、"粉胶囊3.0",如确实没有合适的就返回空字符串 "")
   - brand: 品牌英文/中文名,如包装上能识别出品牌则填(如"OSITREE"),否则返回空字符串 ""

严格输出格式要求(必须遵守,两个分支都适用):
- 直接输出一个合法的 JSON 对象,不要任何前后说明文字
- 不要使用 markdown 代码块(不要 \`\`\`json 也不要 \`\`\`)
- 不要在 JSON 之前或之后加"好的"、"以下是"、"方案如下"、"我注意到"之类的话
- 第一个字符必须是 {,最后一个字符必须是 }
- 护肤品分支:顶层字段必须严格是 product_type, visual_features, selling_points, visual_style, color_system, image_plan, copy;image_plan 数组必须有 3 个对象,id 依次是 "white-bg", "lifestyle-scene", "detail-closeup"
- 非护肤品分支:顶层字段必须严格是 unsupported, reason;不要再输出其他字段`;

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
    copy: {
      type: "object",
      additionalProperties: false,
      properties: {
        main_title: { type: "string" },
        sub_title: { type: "string" },
        bullets: { type: "array", items: { type: "string" } },
        side_badges: { type: "array", items: { type: "string" } },
        new_badge: { type: "string" },
        brand: { type: "string" },
      },
      required: ["main_title", "sub_title", "bullets", "side_badges", "new_badge", "brand"],
    },
  },
  required: [
    "product_type",
    "visual_features",
    "selling_points",
    "visual_style",
    "color_system",
    "image_plan",
    "copy",
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

/**
 * Tolerant JSON extractor for Claude responses that may come back wrapped in
 * markdown fences or surrounded by chatty prose (common when going through
 * proxies that drop the json_schema output_config).
 *
 * Strategy, in order:
 *  1. Strip ```json … ``` or ``` … ``` fences if present.
 *  2. Try a plain JSON.parse on the trimmed text.
 *  3. Fallback: slice from the first `{` to the last `}` and parse that.
 *
 * Returns the parsed value, or throws the original parse error from step 2/3.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  // 1. Strip ```json ... ``` or ``` ... ``` code fences.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // 2. Direct parse.
  try {
    return JSON.parse(candidate);
  } catch (firstErr) {
    // 3. Fallback: slice from first `{` to last `}`.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = candidate.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        // fall through and rethrow firstErr below for clearer message
      }
    }
    throw firstErr;
  }
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

    const rawText = textBlock.text;
    console.log("[analyze] rawText length:", rawText.length);
    console.log("[analyze] rawText preview:", rawText.slice(0, 300));

    let plan: unknown;
    try {
      plan = extractJson(rawText);
    } catch (e) {
      console.error("[analyze] JSON parse failed. Full rawText below:");
      console.error(rawText);
      return jsonError(502, "Claude returned invalid JSON", {
        detail: String(e),
        rawPreview: rawText.slice(0, 500),
      });
    }

    // Non-skincare branch: Claude returned {unsupported: true, reason: "..."}.
    // Surface it as a 200 response with the same shape, so the front-end can
    // show a friendly message instead of an error.
    if (
      typeof plan === "object" &&
      plan !== null &&
      "unsupported" in plan &&
      (plan as { unsupported?: unknown }).unsupported === true
    ) {
      const reasonRaw = (plan as { reason?: unknown }).reason;
      const reason =
        typeof reasonRaw === "string" && reasonRaw.trim()
          ? reasonRaw
          : "目前 LightPic 只支持护肤品类(面霜、精华、洁面、防晒等),其他品类正在筹备中。";
      console.log("[analyze] unsupported product, reason:", reason);
      console.log("[analyze] succeeded (unsupported branch) in", Date.now() - t0, "ms");
      return jsonResponse(200, { unsupported: true, reason });
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
