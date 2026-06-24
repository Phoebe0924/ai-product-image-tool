import {
  openAiErrorResponse,
  proxyToStableApi,
} from "@/lib/server/api-proxy";
import {
  applyCloudflareRateLimit,
  applyTrustedProxyRateLimit,
  rejectOversizedImageData,
  rejectOversizedRequest,
  requireTrustedProxy,
} from "@/lib/server/api-guard";

async function callClaudeMessages(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  authMode: "anthropic" | "bearer",
): Promise<unknown> {
  const authHeaders: Record<string, string> =
    authMode === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${apiKey}` };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function callOpenAIResponses(apiKey: string, payload: Record<string, unknown>): Promise<unknown> {
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com";
  const endpoint = `${baseURL.replace(/\/$/, "")}/v1/responses`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "iad1";

const SYSTEM_PROMPT = `你是拼多多护肤品/美妆商品图方案专家。

【重要：输出格式规则】
你的回复必须是且只能是一个 JSON 对象。
- 第一个字符必须是 {
- 最后一个字符必须是 }
- 不要输出任何 Markdown、标题、列表、代码块、开场白、结尾语、分析说明
- 不要输出 \`\`\`json 或 \`\`\`
- 不要输出任何 JSON 以外的内容

【非护肤品/美妆分支】
如果图片不是护肤品或美妆品，只输出：
{"unsupported": true, "reason": "<一句中文说明检测到的品类，以及目前只支持护肤品和美妆品>"}

【护肤品/美妆分支】
输出以下 6 个字段的 JSON：

1. product_type: 中文产品类型，如"防晒霜"、"面霜"、"精华液"
2. selling_points: 最多 3 条核心卖点，每条 ≤15 字，用户结果语言。禁止：玻璃肌、焕变、深层滋养、科技配方、成分可视化、医疗级功效、祛痘祛斑美白
3. pain_points: 最多 3 条用户痛点，每条 ≤15 字，如"夏天出油脱妆"、"干皮上妆起皮"
4. visual_style: 一句话视觉风格，≤20 字，拼多多电商风格，如"清爽白底强产品感"
5. main_title: 主标题，≤12 字，直接说用户结果，禁止空泛词
6. subtitle: 副标题，≤16 字，强化主标题承诺

输出示例（严格按此格式）：
{"product_type":"防晒霜","selling_points":["SPF50+全效防晒","清爽不泛白","修护屏障"],"pain_points":["涂防晒闷痘搓泥","晒后泛红敏感","夏天防晒又油腻"],"visual_style":"粉白清爽极简产品感","main_title":"防晒不泛白素颜透亮","subtitle":"SPF50+全天候抵御紫外线"}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    product_type: { type: "string" },
    selling_points: { type: "array", items: { type: "string" } },
    pain_points: { type: "array", items: { type: "string" } },
    visual_style: { type: "string" },
    main_title: { type: "string" },
    subtitle: { type: "string" },
  },
  required: ["product_type", "selling_points", "pain_points", "visual_style", "main_title", "subtitle"],
};

const PAIN_WORDS = ["不卡粉","不假白","持妆","控油","遮瑕","通勤","不斑驳","干皮","起皮","换季","紧绷","保湿","不油腻","睡前","妆前","不搓泥","敏感肌","不刺痛","不闷痘","不泛红","补水","锁水","提亮","黄黑皮","熬夜","军训","暴晒","防晒","修护","滋润","轻薄","快速吸收"];
const VAGUE_WORDS = ["自然清新","日常必备","深层滋养","焕新","温和提亮"];

function scoreplan(plan: unknown): { ctrPotential: number; subjectClarity: number; pddMatch: number; aiTemplateFeeling: number; scoreSource: string } {
  let ctr = 60;
  let pdd = 60;
  const aiTemplate = 50; // canvas template感，前端固定展示，后续可扩展

  if (typeof plan === "object" && plan !== null && "image_plan" in plan) {
    const imagePlan = (plan as { image_plan?: unknown[] }).image_plan ?? [];
    for (const scene of imagePlan) {
      if (typeof scene !== "object" || scene === null) continue;
      const copy = (scene as { copy?: { main_title?: string; bullets?: string[] } }).copy;
      if (!copy) continue;
      const allText = [copy.main_title ?? "", ...(copy.bullets ?? [])].join(" ");
      for (const w of PAIN_WORDS) {
        if (allText.includes(w)) { ctr += 4; pdd += 3; }
      }
      for (const w of VAGUE_WORDS) {
        // 空泛词单独出现（前后无其他实质词）扣分
        const standalone = new RegExp(`(^|[^\\u4e00-\\u9fa5])${w}([^\\u4e00-\\u9fa5]|$)`);
        if (standalone.test(allText)) { ctr -= 8; pdd -= 6; }
      }
    }
  }

  return {
    ctrPotential: Math.min(99, Math.max(10, ctr)),
    subjectClarity: 55, // 无法从文本判断图像主体，给中性值
    pddMatch: Math.min(99, Math.max(10, pdd)),
    aiTemplateFeeling: aiTemplate,
    scoreSource: "rule_demo",
  };
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// Server-side hard filter — runs after Claude returns image_plan.
// Any scene whose role/title/purpose/prompt hits a banned keyword is replaced
// wholesale with a safe fallback template. Code-level enforcement, independent
// of whether Claude followed the system prompt.
// ---------------------------------------------------------------------------

const BANNED_KEYWORDS = [
  // people / models
  "真人", "模特", "人脸", "人体", "人物", "脸部", "皮肤变化",
  "model", "human face", "skin transformation",
  // before/after
  "妆前", "妆后", "前后对比", "使用前", "使用后",
  "before and after", "before/after", "comparison shot",
  // effect claims
  "玻璃肌", "焕变", "变白", "美白", "祛斑", "祛痘",
  "whitening", "brightening effect", "skin transformation",
  // tech / ingredient
  "科技配方", "成分可视化", "专利", "实验室", "医美", "临床", "配方图",
  "ingredient visualization", "formula diagram", "lab", "clinical", "patent",
  // shade count
  "色号",
];

type SceneShape = {
  id: string;
  role?: string;
  layout_variant?: string;
  title?: string;
  purpose?: string;
  prompt?: string;
  copy?: unknown;
};

const SAFE_FALLBACKS: Record<string, Omit<SceneShape, "id" | "copy">> = {
  "主视觉图": {
    role: "主视觉图",
    layout_variant: "A",
    title: "产品主视觉",
    purpose: "白底极简背景，产品正面居中，突出包装质感和品牌标识",
    prompt:
      "CRITICAL PRODUCT FIDELITY: Do NOT alter the product's structure, shape, cap proportions, body color, material finish, logo position, label text, or packaging design in any way. Do NOT add extra caps, bottles, bases, or accessories that do not exist in the original. This must be the exact same SKU as the original photo — only the background, lighting, and environment may change. " +
      "The product must be LARGE and DOMINANT, filling at least 50% of frame height. " +
      "No human faces, no human bodies, no hands, no models, no skin. No text, no labels, no watermarks, no overlays. " +
      "Pure white or very light neutral background. Product centered, front-facing, even soft lighting that highlights packaging texture and brand identity. Minimalist composition, no props.",
  },
  "质地/妆感图": {
    role: "质地/妆感图",
    layout_variant: "C",
    title: "质地细节特写",
    purpose: "产品局部特写，展示瓶身材质和质地细节，柔和侧光，背景简洁",
    prompt:
      "CRITICAL PRODUCT FIDELITY: Do NOT alter the product's structure, shape, cap proportions, body color, material finish, logo position, label text, or packaging design in any way. Do NOT add extra caps, bottles, bases, or accessories that do not exist in the original. This must be the exact same SKU as the original photo — only the background, lighting, and environment may change. " +
      "The product must be LARGE and DOMINANT, filling at least 50% of frame height. " +
      "No human faces, no human bodies, no hands, no models, no skin. No text, no labels, no watermarks, no overlays. " +
      "Close-up shot emphasizing the product's surface texture and material finish. Soft side lighting, simple neutral background. No ingredient diagrams, no technology graphics, no before/after elements.",
  },
  "使用场景图": {
    role: "使用场景图",
    layout_variant: "D",
    title: "日常使用场景",
    purpose: "梳妆台或浴室台面场景，产品自然摆放，氛围真实，不出现人物",
    prompt:
      "CRITICAL PRODUCT FIDELITY: Do NOT alter the product's structure, shape, cap proportions, body color, material finish, logo position, label text, or packaging design in any way. Do NOT add extra caps, bottles, bases, or accessories that do not exist in the original. This must be the exact same SKU as the original photo — only the background, lighting, and environment may change. " +
      "The product must be LARGE and DOMINANT, filling at least 50% of frame height. " +
      "No human faces, no human bodies, no hands, no models, no skin. No text, no labels, no watermarks, no overlays. " +
      "Lifestyle scene: product placed naturally on a dressing table or bathroom countertop. Warm ambient light, clean and uncluttered. At most one or two simple props. No people, no before/after elements.",
  },
  "卖点信息图": {
    role: "卖点信息图",
    layout_variant: "B",
    title: "卖点展示图",
    purpose: "产品偏右，左侧大面积留白供文案叠加，背景干净纯色",
    prompt:
      "CRITICAL PRODUCT FIDELITY: Do NOT alter the product's structure, shape, cap proportions, body color, material finish, logo position, label text, or packaging design in any way. Do NOT add extra caps, bottles, bases, or accessories that do not exist in the original. This must be the exact same SKU as the original photo — only the background, lighting, and environment may change. " +
      "The product must be LARGE and DOMINANT, filling at least 50% of frame height. " +
      "No human faces, no human bodies, no hands, no models, no skin. No text, no labels, no watermarks, no overlays. " +
      "Product positioned on the right side of frame, large empty space on the left for copy overlay. Clean solid or very subtle gradient background. No props, no clutter.",
  },
};

const ROLE_ORDER = ["主视觉图", "质地/妆感图", "使用场景图", "卖点信息图"] as const;

function sceneHitsBan(scene: SceneShape): boolean {
  const haystack = [
    scene.role ?? "",
    scene.title ?? "",
    scene.purpose ?? "",
    scene.prompt ?? "",
  ].join(" ").toLowerCase();
  return BANNED_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
}

function sanitizeImagePlan(rawPlan: unknown): unknown {
  if (typeof rawPlan !== "object" || rawPlan === null || !("image_plan" in rawPlan)) {
    return rawPlan;
  }
  const plan = rawPlan as Record<string, unknown>;
  const scenes = Array.isArray(plan.image_plan) ? plan.image_plan : [];

  const sanitized = scenes.map((scene, idx) => {
    const s = (typeof scene === "object" && scene !== null ? scene : {}) as SceneShape;
    const roleForSlot = ROLE_ORDER[idx] ?? ROLE_ORDER[0];

    if (sceneHitsBan(s)) {
      console.warn(
        `[analyze] scene ${s.id ?? idx} hit ban filter (role="${s.role}", title="${s.title}") — replacing with safe fallback "${roleForSlot}"`,
      );
      return { ...s, ...SAFE_FALLBACKS[roleForSlot], id: s.id ?? `scene-${idx + 1}` };
    }

    // Enforce correct role/layout for this slot even if not banned.
    if (s.role !== roleForSlot || s.layout_variant !== SAFE_FALLBACKS[roleForSlot].layout_variant) {
      console.warn(
        `[analyze] scene ${s.id ?? idx} role/layout mismatch (got "${s.role}"/"${s.layout_variant}", expected "${roleForSlot}"/"${SAFE_FALLBACKS[roleForSlot].layout_variant}") — correcting`,
      );
      return { ...s, role: roleForSlot, layout_variant: SAFE_FALLBACKS[roleForSlot].layout_variant };
    }

    return s;
  });

  // Pad to 4 if Claude returned fewer scenes.
  while (sanitized.length < 4) {
    const idx = sanitized.length;
    const roleForSlot = ROLE_ORDER[idx];
    sanitized.push({ id: `scene-${idx + 1}`, ...SAFE_FALLBACKS[roleForSlot], copy: null });
  }

  return { ...plan, image_plan: sanitized.slice(0, 4) };
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

  // 1. Find a ```json ... ``` or ``` ... ``` fence anywhere in the response.
  //    Claude sometimes wraps the JSON in a fence even when asked not to,
  //    and may add prose before/after the fence block.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
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
    const oversizedRequest = rejectOversizedRequest(req);
    if (oversizedRequest) return oversizedRequest;

    const rateLimited = await applyCloudflareRateLimit(req, "ANALYZE_RATE_LIMIT");
    if (rateLimited) return rateLimited;

    const proxied = await proxyToStableApi(req, "/api/analyze");
    if (proxied) return proxied;

    const accessError = requireTrustedProxy(req);
    if (accessError) return accessError;

    const trustedProxyRateLimited = applyTrustedProxyRateLimit(req, "analyze", 5);
    if (trustedProxyRateLimited) return trustedProxyRateLimited;

    const analyzeProvider = process.env.ANALYZE_PROVIDER ?? "openai";
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
    console.log(
      "[analyze] provider:",
      analyzeProvider,
      "| openai key present:",
      Boolean(openaiKey),
      "| anthropic key present:",
      Boolean(anthropicKey),
      "| anthropic baseURL:",
      baseURL ?? "(default api.anthropic.com)",
    );
    if (analyzeProvider === "openai" && !openaiKey) return jsonError(500, "Server is missing OPENAI_API_KEY");
    if (analyzeProvider === "anthropic" && !anthropicKey) return jsonError(500, "Server is missing ANTHROPIC_API_KEY");

    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, "Invalid JSON body", { detail: String(e) });
    }
    const { imageDataUrl, productDescription } = (body ?? {}) as { imageDataUrl?: unknown; productDescription?: unknown };
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonError(400, "Missing or invalid image");
    }
    const oversizedImage = rejectOversizedImageData(imageDataUrl);
    if (oversizedImage) return oversizedImage;

    const m = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return jsonError(400, "Could not parse image data URL");
    const mediaType = m[1];
    const base64 = m[2];
    const approxKB = Math.floor((base64.length * 3) / 4 / 1024);
    console.log("[analyze] image:", mediaType, `~${approxKB}KB`);

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      return jsonError(400, `Unsupported media type: ${mediaType}`);
    }

    const descHint =
      typeof productDescription === "string" && productDescription.trim()
        ? `\n\n用户补充说明：「${productDescription.trim()}」——请以此为准确认产品品类，不要仅依赖视觉推断。`
        : "";

    const instructionText = `分析这张护肤品产品图。${descHint}

你必须只输出一个 JSON 对象，格式如下，不要输出任何其他内容：
{"product_type":"防晒霜","selling_points":["卖点1","卖点2","卖点3"],"pain_points":["痛点1","痛点2","痛点3"],"visual_style":"视觉风格描述","main_title":"主标题","subtitle":"副标题"}

要求：
- product_type：中文产品类型
- selling_points：最多3条，每条≤15字，禁止：玻璃肌、焕变、深层滋养、科技配方、医疗级功效
- pain_points：最多3条，每条≤15字
- visual_style：≤20字，拼多多电商风格
- main_title：≤12字，直接说用户结果
- subtitle：≤16字

只输出JSON，第一个字符是{，最后一个字符是}，不要Markdown，不要解释。`;

    let rawText = "";
    let usage: unknown;
    if (analyzeProvider === "anthropic") {
      const messagesEndpoint = baseURL
        ? `${baseURL.replace(/\/$/, "")}/v1/messages`
        : "https://api.anthropic.com/v1/messages";
      console.log("[analyze] anthropic endpoint:", messagesEndpoint);

      let claudeResp: unknown;
      try {
        claudeResp = await callClaudeMessages(
          messagesEndpoint,
          anthropicKey as string,
          {
            model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: base64 },
                  },
                  {
                    type: "text",
                    text: instructionText,
                  },
                ],
              },
            ],
          },
          baseURL ? "bearer" : "anthropic",
        );
      } catch (e) {
        console.error("[analyze] Claude fetch failed:", String(e));
        return jsonError(502, `Failed to reach Claude API: ${String(e)}`);
      }

      const response = claudeResp as {
        usage?: { input_tokens?: number; output_tokens?: number };
        content?: { type: string; text?: string }[];
      };
      usage = response.usage;
      const textBlock = response.content?.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text" || !textBlock.text) {
        return jsonError(502, "Claude returned no text block");
      }
      rawText = textBlock.text;
    } else {
      let openaiResp: unknown;
      try {
        openaiResp = await callOpenAIResponses(openaiKey as string, {
          model: process.env.OPENAI_ANALYZE_MODEL ?? "gpt-5.5",
          instructions: SYSTEM_PROMPT,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: instructionText },
                { type: "input_image", image_url: imageDataUrl },
              ],
            },
          ],
        });
      } catch (e) {
        return openAiErrorResponse("analyze", 502, e);
      }

      const response = openaiResp as {
        usage?: unknown;
        output_text?: string;
        output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      };
      usage = response.usage;
      rawText =
        response.output_text ??
        response.output
          ?.flatMap((item) => item.content ?? [])
          .find((item) => item.type === "output_text" && typeof item.text === "string")
          ?.text ??
        "";
      if (!rawText) {
        return jsonError(502, "OpenAI returned no output text");
      }
    }

    console.log("[analyze] usage:", JSON.stringify(usage ?? {}));
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

    // Schema guard: Claude sometimes returns a non-brief JSON (e.g. a composition
    // schema or other structured doc). Reject anything missing the required fields
    // so the front-end never receives a malformed brief.
    const REQUIRED_FIELDS = ["product_type", "selling_points", "main_title"] as const;
    const missingFields = REQUIRED_FIELDS.filter(
      (f) => !(typeof plan === "object" && plan !== null && f in plan),
    );
    if (missingFields.length > 0) {
      console.error(
        "[analyze] brief schema mismatch — missing fields:",
        missingFields,
        "| rawText length:",
        rawText.length,
        "| rawPreview:",
        rawText.slice(0, 200),
      );
      return jsonError(502, "Claude returned unexpected JSON structure (not a brief)", {
        missingFields,
        rawPreview: rawText.slice(0, 300),
      });
    }

    console.log("[analyze] succeeded in", Date.now() - t0, "ms");
    return jsonResponse(200, { brief: plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[analyze] uncaught:", message, err instanceof Error ? err.stack : undefined);
    return jsonResponse(500, { error: message });
  }
}
