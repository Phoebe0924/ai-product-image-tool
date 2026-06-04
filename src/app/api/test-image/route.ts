export const runtime = "nodejs";
export const maxDuration = 90;

const DEFAULT_TEST_PROMPT =
  "一张粉色防晒霜拼多多官方店铺主图，白粉色清爽电商海报风格，突出 SPF50+ PA++++，大字标题，高倍防晒，水润提亮，官方正品感";

export async function POST(req: Request): Promise<Response> {
  const key = process.env.SHIYUN_API_KEY;
  const model = process.env.SHIYUN_IMAGE_MODEL ?? "gpt-image-2";
  const baseUrl = process.env.SHIYUN_BASE_URL ?? "https://shiyunapi.com";
  const endpoint = `${baseUrl}/v1/images/edits`;

  console.log("[test-image] provider: shiyun");
  console.log("[test-image] model:", model);
  console.log("[test-image] endpoint:", endpoint);
  console.log("[test-image] key present:", Boolean(key), "length:", key?.length ?? 0);

  if (!key) {
    return Response.json({ error: "SHIYUN_API_KEY not set" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Invalid JSON body", detail: String(e) }, { status: 400 });
  }

  const { imageDataUrl, prompt: bodyPrompt } = (body ?? {}) as { imageDataUrl?: unknown; prompt?: unknown };
  const prompt = typeof bodyPrompt === "string" && bodyPrompt.trim() ? bodyPrompt.trim() : DEFAULT_TEST_PROMPT;
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return Response.json({ error: "Missing or invalid imageDataUrl" }, { status: 400 });
  }

  // Convert data URL → Buffer → Blob for multipart upload
  const mimeMatch = imageDataUrl.match(/^data:(image\/[a-z+]+);base64,/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const base64 = imageDataUrl.slice((mimeMatch?.[0].length ?? 0));
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: mime });

  const form = new FormData();
  form.append("image", blob, "product.png");
  form.append("prompt", prompt);
  form.append("model", model);
  form.append("n", "1");
  form.append("size", "1024x1024");

  console.log("[test-image] image size:", buffer.length, "bytes | mime:", mime);
  console.log("[test-image] sending multipart/form-data to", endpoint);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (e) {
    console.error("[test-image] fetch threw:", String(e));
    return Response.json({ error: "fetch failed", detail: String(e) }, { status: 502 });
  }

  const ctype = res.headers.get("content-type") ?? "";
  let data: unknown;
  if (ctype.includes("application/json")) {
    data = await res.json().catch((e) => ({ __parseError: String(e) }));
  } else {
    const text = await res.text().catch(() => "");
    data = { __nonJson: text.slice(0, 500) };
  }

  console.log("[test-image] status:", res.status);
  console.log("[test-image] response fields:", Object.keys(data as object));

  if (!res.ok) {
    console.error("[test-image] error response:", JSON.stringify(data));
    return Response.json(
      { error: `Shiyun HTTP ${res.status}`, detail: data, provider: "shiyun", model, endpoint },
      { status: 502 },
    );
  }

  const item = (data as { data?: { url?: string; b64_json?: string }[] }).data?.[0];
  const imageUrl = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);

  if (!imageUrl) {
    console.error("[test-image] no image in response:", JSON.stringify(data));
    return Response.json(
      { error: "No image in response", raw: data, provider: "shiyun", model, endpoint },
      { status: 502 },
    );
  }

  const format = item?.url ? "url" : "b64_json";
  console.log("[test-image] SUCCESS — format:", format, "| imageUrl length:", imageUrl.length);

  return Response.json({
    success: true,
    imageUrl,
    format,
    provider: "shiyun",
    model,
    endpoint,
    prompt,
  });
}
