"use client";

import Image from "next/image";
import { useState, useRef } from "react";

const DEFAULT_PROMPT =
  "基于这张商品图，生成一张拼多多官方店铺主图，保持商品主体、包装颜色、品牌标识尽量不变，背景为清爽粉白电商海报风格，突出高倍防晒和水润提亮";

interface Result {
  success?: boolean;
  imageUrl?: string;
  format?: string;
  provider?: string;
  model?: string;
  endpoint?: string;
  error?: string;
  detail?: unknown;
  elapsedMs?: number;
}

export default function TestImagePage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleTest() {
    if (!imageDataUrl) return;
    setLoading(true);
    setResult(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/test-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, prompt }),
      });
      const data = await res.json();
      setResult({ ...data, elapsedMs: Date.now() - t0 });
    } catch (e) {
      setResult({ error: String(e), elapsedMs: Date.now() - t0 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 18, marginBottom: 24 }}>gpt-image-2 图生图测试</h1>

      {/* Upload */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#666" }}>1. 上传商品图</div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
        {imageDataUrl && (
          <Image
            src={imageDataUrl}
            alt="uploaded"
            width={320}
            height={200}
            unoptimized
            style={{ display: "block", marginTop: 12, maxHeight: 200, maxWidth: "100%", height: "auto", border: "1px solid #ddd" }}
          />
        )}
      </div>

      {/* Prompt */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: "#666" }}>2. Prompt</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          style={{ width: "100%", padding: 8, fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box" }}
        />
      </div>

      {/* Button */}
      <button
        onClick={handleTest}
        disabled={!imageDataUrl || loading}
        style={{
          padding: "10px 24px",
          background: loading ? "#aaa" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        {loading ? "生成中…（最长 90s）" : "测试 gpt-image-2 图生图"}
      </button>

      {/* Result */}
      {result && (
        <div style={{ borderTop: "1px solid #eee", paddingTop: 20 }}>
          {/* Meta */}
          <table style={{ fontSize: 12, borderCollapse: "collapse", marginBottom: 16, width: "100%" }}>
            <tbody>
              {[
                ["status", result.success ? "✅ 成功" : "❌ 失败"],
                ["provider", result.provider ?? "—"],
                ["model", result.model ?? "—"],
                ["endpoint", result.endpoint ?? "—"],
                ["format", result.format ?? "—"],
                ["耗时", result.elapsedMs != null ? `${result.elapsedMs} ms` : "—"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: "3px 12px 3px 0", color: "#888", whiteSpace: "nowrap" }}>{k}</td>
                  <td style={{ padding: "3px 0", wordBreak: "break-all" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Error */}
          {result.error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>错误</div>
              <div>{result.error}</div>
              {result.detail != null && (
                <pre style={{ marginTop: 8, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(result.detail, null, 2).slice(0, 800)}
                </pre>
              )}
            </div>
          )}

          {/* Image */}
          {result.imageUrl && (
            <div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>生成结果</div>
              <Image
                src={result.imageUrl}
                alt="generated"
                width={1024}
                height={1024}
                unoptimized
                style={{ maxWidth: "100%", height: "auto", border: "1px solid #ddd", borderRadius: 4 }}
              />
              <div style={{ marginTop: 8 }}>
                <a
                  href={result.imageUrl}
                  download="generated.png"
                  style={{ fontSize: 12, color: "#2563eb" }}
                >
                  下载图片
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
