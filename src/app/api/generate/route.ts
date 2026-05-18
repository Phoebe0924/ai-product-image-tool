export const runtime = "nodejs";
export const maxDuration = 90;

const SCENE_PROMPTS: Record<string, string> = {
  "white-bg":
    "Replace the background with a pure bright white seamless studio backdrop. Center the product with a soft realistic shadow beneath it. Even neutral studio lighting.",
  "lifestyle-scene":
    "Place the product in a warm natural lifestyle setting with soft daylight, gentle tasteful props, and a softly blurred cozy home interior in the background.",
  "detail-closeup":
    "Create a tight close-up macro shot focusing on the product's texture, material, and fine details. Add soft directional studio lighting that emphasizes craftsmanship. Subtle blurred background.",
};

const SCENES: Record<string, string> = Object.fromEntries(
  Object.entries(SCENE_PROMPTS).map(([id, p]) => [id, `${p} Keep the product unchanged.`]),
);

const REPLICATE_CREATE_URL =
  "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-max/predictions";

const TOTAL_BUDGET_MS = 75_000;
const POLL_INTERVAL_MS = 2_000;
const PER_FETCH_TIMEOUT_MS = 12_000;
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
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

export async function POST(req: Request): Promise<Response> {
  const t0 = Date.now();
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    console.log("[generate] token present:", Boolean(token), "length:", token?.length ?? 0);
    if (!token) return jsonError(500, "Server is missing REPLICATE_API_TOKEN");

    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, "Invalid JSON body", { detail: String(e) });
    }
    const { imageDataUrl, scene } = (body ?? {}) as {
      imageDataUrl?: unknown;
      scene?: unknown;
    };

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return jsonError(400, "Missing or invalid image");
    }
    if (typeof scene !== "string") return jsonError(400, "Missing scene");
    const prompt = SCENES[scene];
    if (!prompt) return jsonError(400, "Unknown scene");

    const replicateInput = {
      input_image: imageDataUrl,
      prompt,
      output_format: "jpg",
    };

    const imgMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
    const approxBytes = Math.floor(((imageDataUrl.length - (imgMatch?.[0].length ?? 0)) * 3) / 4);
    console.log("[generate] payload:", {
      input_image: `<${imgMatch?.[1] ?? "image"}, ~${(approxBytes / 1024).toFixed(0)}KB>`,
      prompt_chars: prompt.length,
      scene,
    });

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
        return jsonResponse(200, { imageUrl: output });
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
