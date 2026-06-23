const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function proxyToStableApi(
  req: Request,
  pathname: string,
): Promise<Response | null> {
  const origin = process.env.LIGHTPIC_API_ORIGIN?.trim();
  if (!origin) return null;

  const requestUrl = new URL(req.url);
  const originUrl = new URL(origin);
  if (requestUrl.host === originUrl.host) return null;

  const target = `${origin.replace(/\/$/, "")}${pathname}`;
  const contentType = req.headers.get("content-type");

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: contentType ? { "Content-Type": contentType } : undefined,
      body: await req.arrayBuffer(),
    });
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? JSON_HEADERS["Content-Type"],
    );
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error(`[api-proxy] ${pathname} failed:`, error);
    return new Response(
      JSON.stringify({
        error: "AI 服务暂时不可用，请稍后重试",
        code: "stable_api_unreachable",
      }),
      { status: 502, headers: JSON_HEADERS },
    );
  }
}

export function isUnsupportedRegionError(value: unknown): boolean {
  const text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return (
    text.includes("unsupported_country_region_territory") ||
    text.includes("Country, region, or territory not supported")
  );
}

export function openAiErrorResponse(
  context: string,
  status: number,
  value: unknown,
): Response {
  const raw = value instanceof Error ? value.message : String(value);
  console.error(`[${context}] OpenAI error:`, raw);

  if (isUnsupportedRegionError(value)) {
    return new Response(
      JSON.stringify({
        error: "AI 服务区域暂时异常，请稍后重试",
        code: "provider_region_unavailable",
      }),
      { status: 503, headers: JSON_HEADERS },
    );
  }

  return new Response(
    JSON.stringify({
      error: "AI 服务请求失败，请稍后重试",
      code: "provider_request_failed",
    }),
    { status, headers: JSON_HEADERS },
  );
}
