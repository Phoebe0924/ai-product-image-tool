import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;

const SCENES: Record<string, string> = {
  "marble-kitchen":
    "Place this product on a clean white marble kitchen counter, soft natural morning light from a window, shallow depth of field, photorealistic lifestyle product photography",
  "wood-table":
    "Place this product on a warm wooden table with subtle wood grain, cozy ambient indoor light, slight bokeh in background, photorealistic lifestyle product photography",
  "outdoor-cafe":
    "Place this product on an outdoor cafe table with a blurred green plant background, soft golden-hour daylight, photorealistic lifestyle product photography",
};

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

    const res = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            input_image: imageDataUrl,
            prompt,
            output_format: "jpg",
          },
        }),
      },
    );

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
