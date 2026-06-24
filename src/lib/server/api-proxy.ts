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
  const proxySecret = process.env.LIGHTPIC_PROXY_SECRET?.trim();
  const clientKey =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  if (proxySecret) headers.set("X-LightPic-Proxy-Secret", proxySecret);
  headers.set("X-LightPic-Client-Key", clientKey);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: await req.arrayBuffer(),
    });
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? JSON_HEADERS["Content-Type"],
    );
    responseHeaders.set("Cache-Control", "no-store");
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("Retry-After", retryAfter);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
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
