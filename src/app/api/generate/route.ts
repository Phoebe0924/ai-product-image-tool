export const runtime = "nodejs";
export const maxDuration = 120;

const REPLICATE_CREATE_URL =
  "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-max/predictions";

const SHIYUN_IMAGE_URL = "https://shiyunapi.com/v1/images/edits";

const TOTAL_BUDGET_MS = 75_000;
const POLL_INTERVAL_MS = 2_000;
const PER_FETCH_TIMEOUT_MS = 12_000;
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

function buildMainImagePrompt(brief: Brief): string {
  const type = brief.product_type ?? "护肤品";
  const points = (brief.selling_points ?? []).slice(0, 3).map((p) =>
    // trim to ≤6 chars so gpt-image-2 renders them reliably
    p.replace(/[，,。.、\s]/g, "").slice(0, 8)
  );
  const mainTitle = (brief.main_title ?? "").slice(0, 10);
  const subtitle = (brief.subtitle ?? "").slice(0, 14);

  const titleLine = mainTitle || "核心功效";
  const subtitleLine = subtitle || "";
  const bulletsText = points.length > 0 ? points.join(" / ") : "高品质";

  return (
    `拼多多800x800商品主图，目标提升点击率和成交率。` +
    `商品类型：${type}。` +
    `商品主体：保持原图包装完全不变，放在画面右侧，占画面高度45%-50%，清晰完整。` +
    `左侧大标题："${titleLine}"，粗体，颜色与背景高对比。` +
    (subtitleLine ? `副标题："${subtitleLine}"，在大标题下方，字号略小。` : "") +
    `左下三条卖点：✓${bulletsText.split(" / ").join(" ✓")}，字号适中。` +
    `右上角"官方正品"圆章。` +
    `底部横条文字："官方正品 · 品质保证 · 放心购买"。` +
    `风格：粉白清爽电商风，信息密度高，不要大面积留白，不要高级杂志感。` +
    `禁止：真人、人脸、虚构销量评价成分、原图没有的文字水印。`
  );
}

export async function POST(req: Request): Promise<Response> {
  const t0 = Date.now();
  try {
    // Dev mode: skip Replicate entirely, return a placeholder image.
    if (process.env.LIGHTPIC_DEV_MODE === "1") {
      const placeholder = DEV_PLACEHOLDERS[_devCounter % DEV_PLACEHOLDERS.length];
      _devCounter++;
      console.log("[generate] DEV MODE — returning placeholder:", placeholder);
      await new Promise((r) => setTimeout(r, 800)); // simulate latency
      return jsonResponse(200, { imageUrl: placeholder });
    }

    // ── Provider selection ──────────────────────────────────────────────────
    const imageProvider = process.env.IMAGE_PROVIDER ?? "replicate";
    const shiyunKey = process.env.SHIYUN_API_KEY;
    const shiyunModel = process.env.SHIYUN_IMAGE_MODEL ?? "gpt-image-2";
    const shiyunEndpoint = process.env.SHIYUN_BASE_URL
      ? `${process.env.SHIYUN_BASE_URL.replace(/\/$/, "")}/v1/images/edits`
      : SHIYUN_IMAGE_URL;

    console.log("[generate] provider:", imageProvider, "| model:", shiyunModel, "| endpoint:", shiyunEndpoint);

    // ── Parse request body (shared by both providers) ────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, "Invalid JSON body", { detail: String(e) });
    }
    const { imageDataUrl, prompt: rawPrompt, brief, nonce } = (body ?? {}) as {
      imageDataUrl?: unknown;
      prompt?: unknown;
      brief?: Brief;
      nonce?: unknown;
    };

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log("[generate] requestId:", requestId, "| nonce:", nonce ?? "(none)", "| startedAt:", new Date().toISOString());

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonError(400, "Missing or invalid image");
    }

    // brief takes priority; rawPrompt is the fallback for direct callers
    const basePrompt =
      brief && typeof brief === "object"
        ? buildMainImagePrompt(brief)
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
