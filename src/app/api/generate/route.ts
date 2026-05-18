import { NextRequest, NextResponse } from "next/server";

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

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  console.error("[generate] error", status, error, extra ?? {});
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    console.log("[generate] token present:", Boolean(token), "length:", token?.length ?? 0);
    if (!token) {
      return jsonError(500, "Server is missing REPLICATE_API_TOKEN");
    }

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
    if (typeof scene !== "string") {
      return jsonError(400, "Missing scene");
    }
    const prompt = SCENES[scene];
    if (!prompt) {
      return jsonError(400, "Unknown scene");
    }

    const REPLICATE_URL =
      "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions";

    const replicateInput = {
      input_image: imageDataUrl,
      prompt,
      output_format: "jpg",
    };

    const imgMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
    const approxBytes = Math.floor(((imageDataUrl.length - (imgMatch?.[0].length ?? 0)) * 3) / 4);
    console.log("[generate] →", REPLICATE_URL);
    console.log("[generate] payload:", {
      ...replicateInput,
      input_image: `<${imgMatch?.[1] ?? "image"}, ~${(approxBytes / 1024).toFixed(0)}KB>`,
      prompt_chars: prompt.length,
      scene,
    });

    let res: Response;
    try {
      res = await fetch(REPLICATE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input: replicateInput }),
      });
    } catch (e) {
      return jsonError(502, "Failed to reach Replicate", { detail: String(e) });
    }

    const ctype = res.headers.get("content-type") ?? "";
    console.log("[generate] replicate status:", res.status, "content-type:", ctype);

    if (!ctype.toLowerCase().includes("application/json")) {
      const snippet = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[generate] replicate non-JSON body:", snippet);
      return jsonError(502, `Replicate returned non-JSON (HTTP ${res.status})`, { snippet });
    }

    let data: { status?: string; error?: string; detail?: string; output?: unknown } = {};
    try {
      data = await res.json();
    } catch (e) {
      return jsonError(502, "Replicate returned invalid JSON", { detail: String(e) });
    }

    if (!res.ok) {
      return jsonError(502, data.detail || data.error || `Replicate request failed (HTTP ${res.status})`);
    }

    if (data.status === "failed" || data.error) {
      return jsonError(502, data.error || "Generation failed");
    }

    const output = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!output || typeof output !== "string") {
      return jsonError(504, "Generation timed out, please try again");
    }

    return NextResponse.json({ imageUrl: output });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[generate] uncaught:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
