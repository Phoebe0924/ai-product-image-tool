const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export const MAX_INPUT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_JSON_BODY_BYTES = 3 * 1024 * 1024;

type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const trustedProxyRateBuckets = new Map<string, RateLimitBucket>();

function jsonError(
  status: number,
  error: string,
  code: string,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function rejectOversizedRequest(req: Request): Response | null {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return jsonError(413, "图片过大，请上传 2MB 以内的图片", "payload_too_large");
  }
  return null;
}

export function rejectOversizedImageData(imageDataUrl: string): Response | null {
  const commaIndex = imageDataUrl.indexOf(",");
  const base64Length = commaIndex >= 0 ? imageDataUrl.length - commaIndex - 1 : 0;
  const approximateBytes = Math.floor((base64Length * 3) / 4);

  if (approximateBytes > MAX_INPUT_IMAGE_BYTES) {
    return jsonError(413, "图片过大，请上传 2MB 以内的图片", "image_too_large");
  }
  return null;
}

export function requireTrustedProxy(req: Request): Response | null {
  const expected = process.env.LIGHTPIC_PROXY_SECRET?.trim();
  if (!expected || process.env.LIGHTPIC_API_ORIGIN?.trim()) return null;

  const received = req.headers.get("x-lightpic-proxy-secret");
  if (received !== expected) {
    return jsonError(403, "请从 LightPic 正式入口使用该服务", "direct_api_forbidden");
  }
  return null;
}

export function applyTrustedProxyRateLimit(
  req: Request,
  scope: "analyze" | "generate",
  limit: number,
): Response | null {
  const expected = process.env.LIGHTPIC_PROXY_SECRET?.trim();
  if (!expected || process.env.LIGHTPIC_API_ORIGIN?.trim()) return null;

  const now = Date.now();
  const windowMs = 60_000;
  const clientKey = req.headers.get("x-lightpic-client-key")?.trim() || "unknown";
  const bucketKey = `${scope}:${clientKey}`;
  const current = trustedProxyRateBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    trustedProxyRateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }

  current.count += 1;
  if (current.count > limit) {
    const retryAfter = String(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
    return jsonError(
      429,
      "试用请求过于频繁，请一分钟后再试",
      "trial_rate_limit",
      { "Retry-After": retryAfter },
    );
  }

  return null;
}

export async function applyCloudflareRateLimit(
  req: Request,
  bindingName: "ANALYZE_RATE_LIMIT" | "GENERATE_RATE_LIMIT",
): Promise<Response | null> {
  if (!process.env.LIGHTPIC_API_ORIGIN?.trim()) return null;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const limiter = (env as CloudflareEnv & Record<string, unknown>)[bindingName] as
      | RateLimitBinding
      | undefined;

    if (!limiter) {
      console.warn(`[api-guard] missing ${bindingName} binding`);
      return null;
    }

    const clientKey =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const result = await limiter.limit({ key: clientKey });

    if (!result.success) {
      return jsonError(
        429,
        "试用请求过于频繁，请一分钟后再试",
        "trial_rate_limit",
        { "Retry-After": "60" },
      );
    }
  } catch (error) {
    console.error(`[api-guard] ${bindingName} failed:`, error);
  }

  return null;
}
