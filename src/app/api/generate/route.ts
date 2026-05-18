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

export async function POST(req: NextRequest) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Server is missing REPLICATE_API_TOKEN" },
        { status: 500 },
      );
    }

    const { imageDataUrl, scene } = await req.json();

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Missing or invalid image" }, { status: 400 });
    }
    const prompt = SCENES[scene];
    if (!prompt) {
      return NextResponse.json({ error: "Unknown scene" }, { status: 400 });
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
    console.log("[generate] full prompt:\n" + prompt);

    const res = await fetch(REPLICATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input: replicateInput }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || "Replicate request failed" },
        { status: 502 },
      );
    }

    if (data.status === "failed" || data.error) {
      return NextResponse.json(
        { error: data.error || "Generation failed" },
        { status: 502 },
      );
    }

    const output = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!output) {
      return NextResponse.json(
        { error: "Generation timed out, please try again" },
        { status: 504 },
      );
    }

    return NextResponse.json({ imageUrl: output });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
