import {
  isUnsupportedRegionError,
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

export const runtime = "nodejs";
export const maxDuration = 120;
export const preferredRegion = "iad1";

const REPLICATE_CREATE_URL =
  "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-max/predictions";

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/edits";
const SHIYUN_IMAGE_URL = "https://shiyunapi.com/v1/images/edits";

const TOTAL_BUDGET_MS = 75_000;
const POLL_INTERVAL_MS = 2_000;
const PER_FETCH_TIMEOUT_MS = 12_000;
const OPENAI_IMAGE_TIMEOUT_MS = 120_000;
const SHIYUN_TIMEOUT_MS = 115_000; // gpt-image-2 edits can take 90-100s
const CREATE_RETRIES = 2;
const POLL_RETRIES = 1;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>): Response {
  console.error("[generate] error", status, error, extra ?? {});
  return jsonResponse(status, { error, ...(extra ?? {}) });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries: number,
  label: string,
): Promise<Response> {
  let lastErr: unknown;
  let used429Retry = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      // 429 rate limit: back off 5s and retry once, outside the normal
      // retry budget. Replicate sometimes returns non-JSON HTML on 429
      // which would otherwise surface as "Replicate returned non-JSON".
      if (res.status === 429 && !used429Retry) {
        used429Retry = true;
        console.warn(`[generate] ${label} got 429 (rate limited), waiting 5s and retrying once`);
        await sleep(5_000);
        attempt--; // don't consume a normal retry slot
        continue;
      }
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        console.warn(`[generate] ${label} got ${res.status}, retrying (attempt ${attempt + 1}/${retries})`);
        await sleep(500 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        console.warn(`[generate] ${label} threw (${String(e)}), retrying (attempt ${attempt + 1}/${retries})`);
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr ?? new Error(`${label} failed`);
}

async function safeJson(res: Response, label: string): Promise<unknown | { __nonJson: string }> {
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.toLowerCase().includes("application/json")) {
    const snippet = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[generate] ${label} non-JSON (HTTP ${res.status}):`, snippet);
    return { __nonJson: snippet };
  }
  try {
    return await res.json();
  } catch (e) {
    console.error(`[generate] ${label} JSON parse error:`, e);
    return { __nonJson: String(e) };
  }
}

// Placeholder images used in dev mode (one per scene slot, cycles if needed).
const DEV_PLACEHOLDERS = [
  "https://placehold.co/800x800/E8F4F8/2563EB?text=Scene+1+%28dev%29",
  "https://placehold.co/800x800/F0FDF4/16A34A?text=Scene+2+%28dev%29",
  "https://placehold.co/800x800/FFF7ED/EA580C?text=Scene+3+%28dev%29",
  "https://placehold.co/800x800/FDF4FF/9333EA?text=Scene+4+%28dev%29",
];

let _devCounter = 0;

type Brief = {
  product_type?: string;
  selling_points?: string[];
  pain_points?: string[];
  visual_style?: string;
  main_title?: string;
  subtitle?: string;
};

type OutputUse = "traffic" | "selling-point" | "scene";
type OutputMode = "visual" | "copy";
type Platform = "pdd" | "taobao" | "douyin" | "xiaohongshu";

function inferVisualTheme(type: string, visualStyle: string): string {
  const combined = (type + " " + visualStyle).toLowerCase();

  if (/紫|妆前|隔离|打底|makeup.?base|primer/.test(combined)) {
    return "淡紫色调为主视觉色，奶灰紫或柔雾紫背景，标题、卖点pill、底部信任条、官方正品角标均使用淡紫或银白色系，整体轻透底妆感";
  }
  if (/黑|金|高端|奢|luxury|black|gold/.test(combined)) {
    return "黑金色调为主视觉色，深色或黑色背景，标题使用香槟金或白色，卖点pill和底部条使用深金或哑光黑，整体高级质感";
  }
  if (/蓝|绿|水|海洋|清透|blue|green|aqua/.test(combined)) {
    return "清透蓝绿色调为主视觉色，浅蓝或薄荷绿背景，标题和卖点pill使用深蓝或白色，底部条使用浅蓝，整体水感清爽";
  }
  if (/棕|茶|卸妆|植萃|木|amber|brown|cleansing/.test(combined)) {
    return "茶棕色调为主视觉色，米白或琥珀色背景，标题使用深棕或白色，卖点pill和底部条使用暖棕或米白，整体植萃清洁感";
  }
  if (/粉底|遮瑕|裸|奶油|肤|foundation|concealer|nude/.test(combined)) {
    return "米裸色调为主视觉色，奶咖或香槟金背景，标题使用玫瑰金或深棕，卖点pill和底部条使用米白或玫瑰金，整体自然肤感";
  }
  // default: skincare / sunscreen / general — soft pink-white, NOT saturated red
  return "低饱和粉白色调为主视觉色，柔和奶白或水光粉背景，标题使用深色或柔和玫瑰粉，卖点pill和底部条使用浅粉或白色，整体清爽轻盈感";
}

function platformName(platform: Platform): string {
  if (platform === "taobao") return "淘宝";
  if (platform === "douyin") return "抖音电商";
  if (platform === "xiaohongshu") return "小红书";
  return "拼多多";
}

function buildMainImagePrompt(
  brief: Brief,
  options: { outputUse?: OutputUse; outputMode?: OutputMode; platform?: Platform } = {},
): string {
  const type = brief.product_type ?? "护肤品";
  const visualStyle = brief.visual_style ?? "";
  const points = (brief.selling_points ?? []).slice(0, 3).map((p) =>
    p.replace(/[，,。.、\s]/g, "").slice(0, 8)
  );
  const mainTitle = (brief.main_title ?? "").slice(0, 10);
  const subtitle = (brief.subtitle ?? "").slice(0, 14);

  const titleLine = mainTitle || "核心功效";
  const subtitleLine = subtitle || "";
  const bulletsText = points.length > 0 ? points.join(" / ") : "高品质";
  const visualTheme = inferVisualTheme(type, visualStyle);
  const outputUse = options.outputUse ?? "traffic";
  const outputMode = options.outputMode ?? "copy";
  const targetPlatform = platformName(options.platform ?? "pdd");

  const productFidelity =
    `商品主体：保持原图包装形状、颜色、品牌logo、瓶身结构尽量不变，清晰完整，不明显变形，不裁切，不改成其他SKU。`;
  const riskGuard =
    `合规边界：不要生成"官方正品"、"正品保证"、"品质保证"、"放心购买"、"敏感肌可用"、"医美"、"美白"、"祛斑"、"祛痘"、"临床认证"等未经商家明确授权或证明的背书/功效词；不要生成虚构认证、虚构销量、虚构奖章。`;

  if (outputMode === "visual") {
    return (
      `${targetPlatform}电商运营视觉底图，800x800。业务目标：为后续运营文案提供高质量视觉承载。` +
      `${productFidelity}` +
      `产品占画面45%-60%，主体突出。` +
      `根据商品调性生成高质感商业背景：${visualTheme}。` +
      `画面可用于后续叠加标题和卖点，所以左侧或上方保留适度干净留白。` +
      `禁止生成任何文字、中文、英文、数字、logo改写、角标、徽章、卖点条、底部信任条、水印。` +
      `只生成产品、背景、光影、材质、少量合理装饰。` +
      riskGuard
    );
  }

  if (outputUse === "selling-point") {
    return (
      `${targetPlatform}电商运营图，800x800。业务目标：讲清卖点，让用户3秒内理解为什么买。` +
      `${productFidelity}` +
      `产品放在画面右侧或中右，占画面40%-50%。` +
      `左侧建立清晰信息区：主标题"${titleLine}"；` +
      (subtitleLine ? `副标题"${subtitleLine}"；` : "") +
      `三条卖点做成信息卡片，每条包含短标题和一句解释：${bulletsText}。` +
      `可加入2个小圆形辅助信息点，但不要堆太满。` +
      `视觉主题：${visualTheme}。` +
      `整体更像详情页首屏/轮播第二张卖点说明图，信息层级清楚，文字可读，重点是降低理解成本而不是单纯好看。` +
      `不要使用右上角"官方正品"角标，也不要使用底部"官方正品/品质保证/放心购买"信任条。` +
      `可以用中性的小图标辅助解释卖点，但不要写未经验证的强背书。` +
      `禁止真人、人脸、改变商品包装结构。` +
      riskGuard
    );
  }

  if (outputUse === "scene") {
    return (
      `${targetPlatform}电商运营图，800x800。业务目标：增强信任，提高商品质感和使用代入感。` +
      `${productFidelity}` +
      `产品为主角，占画面45%-55%，自然放置在适合${type}的真实使用场景中。` +
      `背景和道具必须服务于商品卖点，不要无关杂物。` +
      `文案极少，只允许一个短标题"${titleLine}"和最多2个轻量卖点标签；不要底部信任条，不要大面积促销文字。` +
      `视觉主题：${visualTheme}。` +
      `画面要像详情页氛围图/品牌质感图，清爽可信，有生活感但不出现真人、人脸、手部。核心是让用户觉得商品真实、专业、值得购买。` +
      `不要使用右上角"官方正品"角标，也不要使用底部信任条。` +
      `禁止过度夸张活动促销、改变商品包装结构。` +
      riskGuard
    );
  }

  return (
    // 1. 平台与图类型
    `${targetPlatform}电商运营图，800x800。业务目标：提升点击，让用户在搜索/推荐/活动入口第一眼停下来。` +

    // 2. 商品主体保真
    `${productFidelity}` +
    `产品放在画面右侧，占画面高度45%-55%，清晰完整，视觉权重强。` +

    // 3. 主图版式结构
    `版式：左侧大标题"${titleLine}"，粗体；` +
    (subtitleLine ? `副标题"${subtitleLine}"在大标题下方，字号略小；` : "") +
    `左下三条卖点pill：✓${bulletsText.split(" / ").join(" ✓")}；可以有视觉装饰角标，但不要写"官方正品"、"正品保证"、"品质保证"、"放心购买"；不要使用底部信任条。` +

    // 4. 视觉主题自适应
    `视觉主题：${visualTheme}。` +
    `不要把拼多多风格理解为固定红色促销模板。除非商品本身是红色系，否则不要使用高饱和大红或玫红作为主视觉色。` +
    `整体配色应像专业设计师根据当前商品定制，而不是套同一张模板。` +
    `标题颜色、卖点pill背景色和文字色、官方正品角标颜色、底部信任条颜色，全部跟随上述视觉主题，不要单独使用红色。` +

    // 5. 电商感要求
    `整体是高点击电商运营图，信息清晰、点击感强，信息密度适中。重点是第一眼抓住注意力，同时保持商品可信，不要大面积留白，不要高级杂志大片感，也不要廉价促销牛皮癣感。` +

    // 6. 禁止事项
    `禁止：真人、人脸、虚构销量评价成分认证、原图没有的文字水印、改变商品包装颜色或结构。` +
    riskGuard
  );
}

export async function POST(req: Request): Promise<Response> {
  const t0 = Date.now();
  try {
    const oversizedRequest = rejectOversizedRequest(req);
    if (oversizedRequest) return oversizedRequest;

    const rateLimited = await applyCloudflareRateLimit(req, "GENERATE_RATE_LIMIT");
    if (rateLimited) return rateLimited;

    const proxied = await proxyToStableApi(req, "/api/generate");
    if (proxied) return proxied;

    const accessError = requireTrustedProxy(req);
    if (accessError) return accessError;

    const trustedProxyRateLimited = applyTrustedProxyRateLimit(req, "generate", 8);
    if (trustedProxyRateLimited) return trustedProxyRateLimited;

    // Dev mode: skip external image APIs entirely, return a placeholder image.
    if (process.env.LIGHTPIC_DEV_MODE === "1") {
      const placeholder = DEV_PLACEHOLDERS[_devCounter % DEV_PLACEHOLDERS.length];
      _devCounter++;
      console.log("[generate] DEV MODE — returning placeholder:", placeholder);
      await new Promise((r) => setTimeout(r, 800)); // simulate latency
      return jsonResponse(200, { imageUrl: placeholder });
    }

    // ── Provider selection ──────────────────────────────────────────────────
    const imageProvider = process.env.IMAGE_PROVIDER ?? "openai";
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    const openaiEndpoint = process.env.OPENAI_BASE_URL
      ? `${process.env.OPENAI_BASE_URL.replace(/\/$/, "")}/v1/images/edits`
      : OPENAI_IMAGE_URL;
    const shiyunKey = process.env.SHIYUN_API_KEY;
    const shiyunModel = process.env.SHIYUN_IMAGE_MODEL ?? "gpt-image-2";
    const shiyunEndpoint = process.env.SHIYUN_BASE_URL
      ? `${process.env.SHIYUN_BASE_URL.replace(/\/$/, "")}/v1/images/edits`
      : SHIYUN_IMAGE_URL;

    console.log("[generate] provider:", imageProvider);

    // ── Parse request body (shared by both providers) ────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, "Invalid JSON body", { detail: String(e) });
    }
    const { imageDataUrl, prompt: rawPrompt, brief, outputUse, outputMode, platform, nonce } = (body ?? {}) as {
      imageDataUrl?: unknown;
      prompt?: unknown;
      brief?: Brief;
      outputUse?: unknown;
      outputMode?: unknown;
      platform?: unknown;
      nonce?: unknown;
    };

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log("[generate] requestId:", requestId, "| nonce:", nonce ?? "(none)", "| startedAt:", new Date().toISOString());

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonError(400, "Missing or invalid image");
    }
    const oversizedImage = rejectOversizedImageData(imageDataUrl);
    if (oversizedImage) return oversizedImage;

    // brief takes priority; rawPrompt is the fallback for direct callers
    const basePrompt =
      brief && typeof brief === "object"
        ? buildMainImagePrompt(brief, {
            outputUse:
              outputUse === "selling-point" || outputUse === "scene" || outputUse === "traffic"
                ? outputUse
                : "traffic",
            outputMode: outputMode === "visual" || outputMode === "copy" ? outputMode : "copy",
            platform:
              platform === "taobao" || platform === "douyin" || platform === "xiaohongshu" || platform === "pdd"
                ? platform
                : "pdd",
          })
        : typeof rawPrompt === "string" && rawPrompt.trim()
          ? rawPrompt.trim()
          : null;

    if (!basePrompt) {
      return jsonError(400, "Missing prompt or brief");
    }

    // Append nonce so repeated identical requests produce different outputs
    // (avoids model/CDN caching the same result). Not rendered as image text.
    const nonceStr = typeof nonce === "string" || typeof nonce === "number" ? String(nonce) : Date.now().toString();
    const prompt = basePrompt + ` [variation:${nonceStr}]`;

    const imgMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
    const approxBytes = Math.floor(((imageDataUrl.length - (imgMatch?.[0].length ?? 0)) * 3) / 4);
    console.log("[generate] payload:", {
      input_image: `<${imgMatch?.[1] ?? "image"}, ~${(approxBytes / 1024).toFixed(0)}KB>`,
      prompt_chars: prompt.length,
    });

    // ── OpenAI Images branch ────────────────────────────────────────────────
    if (imageProvider === "openai") {
      if (!openaiKey) {
        return jsonError(500, "Server is missing OPENAI_API_KEY");
      }
      console.log("[generate] using openai | model:", openaiModel, "| endpoint:", openaiEndpoint);

      const mimeMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
      const mime = mimeMatch?.[1] ?? "image/png";
      const base64 = imageDataUrl.slice(mimeMatch?.[0].length ?? 0);
      const buffer = Buffer.from(base64, "base64");
      const blob = new Blob([buffer], { type: mime });

      const form = new FormData();
      form.append("image[]", blob, "product.png");
      form.append("prompt", prompt);
      form.append("model", openaiModel);
      form.append("n", "1");
      form.append("size", "1024x1024");

      console.log("[generate] openai image size:", buffer.length, "bytes | mime:", mime);

      let openaiRes: Response;
      try {
        openaiRes = await fetchWithRetry(
          openaiEndpoint,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: form,
          },
          OPENAI_IMAGE_TIMEOUT_MS,
          0,
          "openai-image-edit",
        );
      } catch (e) {
        return openAiErrorResponse("generate", 502, e);
      }

      const openaiData = await safeJson(openaiRes, "openai-image-edit");
      if (typeof openaiData === "object" && openaiData !== null && "__nonJson" in openaiData) {
        return jsonError(502, `OpenAI returned non-JSON (HTTP ${openaiRes.status})`, {
          snippet: (openaiData as { __nonJson: string }).__nonJson,
        });
      }
      if (!openaiRes.ok) {
        const errData = openaiData as {
          error?: { code?: string; message?: string };
          message?: string;
        };
        const msg = errData?.error?.message ?? errData?.message ?? `OpenAI HTTP ${openaiRes.status}`;
        console.error("[generate] openai error:", msg);
        if (
          errData?.error?.code === "unsupported_country_region_territory" ||
          isUnsupportedRegionError(msg)
        ) {
          return openAiErrorResponse("generate", 503, openaiData);
        }
        return jsonError(502, msg, {
          provider: "openai",
          model: openaiModel,
          endpoint: openaiEndpoint,
          fallbackUsed: false,
          finalProvider: "openai",
        });
      }

      const imageList = (openaiData as { data?: { url?: string; b64_json?: string }[] }).data;
      const item = imageList?.[0];
      const imageUrl = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);
      if (!imageUrl) {
        return jsonError(502, "OpenAI returned no image", {
          provider: "openai",
          model: openaiModel,
          endpoint: openaiEndpoint,
          fallbackUsed: false,
          finalProvider: "openai",
        });
      }

      console.log("[generate] openai succeeded in", Date.now() - t0, "ms | requestId:", requestId, "| imageUrl prefix:", imageUrl.slice(0, 40));
      return jsonResponse(200, {
        imageUrl,
        metadata: {
          provider: "openai",
          model: openaiModel,
          endpoint: openaiEndpoint,
          fallbackUsed: false,
          finalProvider: "openai",
        },
      });
    }

    // ── Shiyun gpt-image-2 branch ────────────────────────────────────────────
    if (imageProvider === "shiyun") {
      if (!shiyunKey) {
        return jsonError(500, "Server is missing SHIYUN_API_KEY");
      }
      console.log("[generate] using shiyun | finalProvider: shiyun | fallbackUsed: false");

      // /v1/images/edits requires multipart/form-data, not JSON
      const mimeMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
      const mime = mimeMatch?.[1] ?? "image/png";
      const base64 = imageDataUrl.slice(mimeMatch?.[0].length ?? 0);
      const buffer = Buffer.from(base64, "base64");
      const blob = new Blob([buffer], { type: mime });

      const form = new FormData();
      form.append("image", blob, "product.png");
      form.append("prompt", prompt);
      form.append("model", shiyunModel);
      form.append("n", "1");
      form.append("size", "1024x1024");

      console.log("[generate] shiyun image size:", buffer.length, "bytes | mime:", mime);
      console.log("[generate] shiyun full prompt:\n", prompt);

      let shiyunRes: Response;
      try {
        shiyunRes = await fetchWithRetry(
          shiyunEndpoint,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${shiyunKey}` },
            body: form,
          },
          SHIYUN_TIMEOUT_MS,
          0,
          "shiyun-create",
        );
      } catch (e) {
        console.error("[generate] shiyun fetch failed:", String(e));
        return jsonError(502, "Failed to reach Shiyun image API", { detail: String(e) });
      }

      const shiyunData = await safeJson(shiyunRes, "shiyun-create");
      if (typeof shiyunData === "object" && shiyunData !== null && "__nonJson" in shiyunData) {
        return jsonError(502, `Shiyun returned non-JSON (HTTP ${shiyunRes.status})`, {
          snippet: (shiyunData as { __nonJson: string }).__nonJson,
        });
      }
      if (!shiyunRes.ok) {
        const errData = shiyunData as { error?: { message?: string }; message?: string };
        const msg = errData?.error?.message ?? errData?.message ?? `Shiyun HTTP ${shiyunRes.status}`;
        console.error("[generate] shiyun error:", msg);
        return jsonError(502, msg, {
          provider: "shiyun",
          model: shiyunModel,
          endpoint: shiyunEndpoint,
          fallbackUsed: false,
          finalProvider: "shiyun",
        });
      }

      const imageList = (shiyunData as { data?: { url?: string; b64_json?: string }[] }).data;
      const item = imageList?.[0];
      const imageUrl = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);
      if (!imageUrl) {
        return jsonError(502, "Shiyun returned no image URL", {
          provider: "shiyun",
          model: shiyunModel,
          endpoint: shiyunEndpoint,
          fallbackUsed: false,
          finalProvider: "shiyun",
        });
      }

      console.log("[generate] shiyun succeeded in", Date.now() - t0, "ms | requestId:", requestId, "| imageUrl length:", imageUrl.length, "| imageUrl prefix:", imageUrl.slice(0, 40));
      return jsonResponse(200, {
        imageUrl,
        metadata: {
          provider: "shiyun",
          model: shiyunModel,
          endpoint: shiyunEndpoint,
          fallbackUsed: false,
          finalProvider: "shiyun",
        },
      });
    }

    // ── Replicate branch (original logic, unchanged) ─────────────────────────
    const token = process.env.REPLICATE_API_TOKEN;
    console.log("[generate] using replicate | token present:", Boolean(token), "length:", token?.length ?? 0);
    if (!token) return jsonError(500, "Server is missing REPLICATE_API_TOKEN");

    const replicateInput = {
      input_image: imageDataUrl,
      prompt,
      output_format: "jpg",
      seed: Math.floor(Math.random() * 2_147_483_647),
    };

    let createRes: Response;
    try {
      createRes = await fetchWithRetry(
        REPLICATE_CREATE_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: replicateInput }),
        },
        PER_FETCH_TIMEOUT_MS,
        CREATE_RETRIES,
        "create",
      );
    } catch (e) {
      return jsonError(502, "Failed to reach Replicate", { detail: String(e) });
    }

    const created = await safeJson(createRes, "create");
    if (
      typeof created === "object" &&
      created !== null &&
      "__nonJson" in created
    ) {
      return jsonError(502, `Replicate returned non-JSON on create (HTTP ${createRes.status})`, {
        snippet: (created as { __nonJson: string }).__nonJson,
      });
    }
    const createData = created as {
      id?: string;
      status?: string;
      error?: string;
      detail?: string;
      urls?: { get?: string };
    };
    if (!createRes.ok) {
      return jsonError(
        502,
        createData.detail || createData.error || `Replicate create failed (HTTP ${createRes.status})`,
      );
    }
    const getUrl = createData.urls?.get;
    if (!getUrl) {
      return jsonError(502, "Replicate did not return a polling URL", { id: createData.id });
    }
    console.log("[generate] prediction created:", createData.id, "polling…");

    while (Date.now() - t0 < TOTAL_BUDGET_MS) {
      await sleep(POLL_INTERVAL_MS);

      let pollRes: Response;
      try {
        pollRes = await fetchWithRetry(
          getUrl,
          { headers: { Authorization: `Bearer ${token}` } },
          PER_FETCH_TIMEOUT_MS,
          POLL_RETRIES,
          "poll",
        );
      } catch (e) {
        console.warn("[generate] poll fetch failed, will retry next tick:", String(e));
        continue;
      }

      if (!pollRes.ok) {
        console.warn("[generate] poll non-ok status:", pollRes.status, "— will retry next tick");
        continue;
      }
      const polled = await safeJson(pollRes, "poll");
      if (
        typeof polled === "object" &&
        polled !== null &&
        "__nonJson" in polled
      ) {
        continue;
      }
      const data = polled as {
        status?: string;
        error?: string;
        output?: unknown;
      };

      if (data.status === "succeeded") {
        const output = Array.isArray(data.output) ? data.output[0] : data.output;
        if (typeof output !== "string" || !output) {
          return jsonError(502, "Generation succeeded but no output URL");
        }
        console.log("[generate] succeeded in", Date.now() - t0, "ms");
        return jsonResponse(200, {
          imageUrl: output,
          metadata: {
            provider: "replicate",
            model: "flux-kontext-max",
            endpoint: REPLICATE_CREATE_URL,
            fallbackUsed: false,
            finalProvider: "replicate",
          },
        });
      }
      if (data.status === "failed" || data.status === "canceled") {
        return jsonError(502, data.error || `Generation ${data.status}`);
      }
    }

    console.warn("[generate] budget exceeded after", Date.now() - t0, "ms");
    return jsonError(504, "Generation timed out, please retry");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[generate] uncaught:", message, stack);
    return jsonResponse(500, { error: message });
  }
}
