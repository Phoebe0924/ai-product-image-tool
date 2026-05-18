"use client";

import { useRef, useState } from "react";

const SCENES = [
  {
    id: "white-bg",
    label: "白底主图",
    description: "适合淘宝/拼多多上架",
  },
  {
    id: "lifestyle-scene",
    label: "场景生活图",
    description: "适合小红书/抖音种草",
  },
  {
    id: "detail-closeup",
    label: "细节特写图",
    description: "展示产品质感细节",
  },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [scene, setScene] = useState<SceneId | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (isHeic(file)) {
      setError("暂不支持 HEIC 格式。请先把图片转成 JPG 再上传。");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(`不支持的文件类型: ${file.type || "未知"}`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    setResultUrl(null);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setOriginalFile(file);
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    setOriginalFile(null);
    setScene(null);
    setResultUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function generate() {
    if (!originalFile || !scene) return;
    setLoading(true);
    setError(null);
    setResultUrl(null);
    const controller = new AbortController();
    const clientTimeout = setTimeout(() => controller.abort(), 95_000);
    try {
      const imageDataUrl = await fileToDataUrl(originalFile);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, scene }),
        signal: controller.signal,
      });
      let data: { imageUrl?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`服务器返回异常 (HTTP ${res.status}),请重试`);
      }
      if (!res.ok) throw new Error(data?.error || `生成失败 (HTTP ${res.status})`);
      if (!data.imageUrl) throw new Error("生成失败:未返回图片地址");
      setResultUrl(data.imageUrl);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("生成超时(>90 秒),请重试");
      } else {
        setError(e instanceof Error ? e.message : "生成失败,请重试");
      }
    } finally {
      clearTimeout(clientTimeout);
      setLoading(false);
    }
  }

  async function downloadResult() {
    if (!resultUrl) return;
    try {
      const res = await fetch(resultUrl);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `lightpic-${scene ?? "image"}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败,请长按图片保存");
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#F7F7F8] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            轻图 LightPic · AI商品图生成
          </h1>
          <p className="text-sm text-[#6B6B6E]">
            上传商品图,10秒生成专业电商场景图
          </p>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {!previewUrl ? (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#D1D1D6] bg-white px-6 py-12 text-[#1A1A1A] transition hover:border-[#1A1A1A] hover:bg-[#FAFAFA] active:bg-[#F0F0F2]"
            >
              <span className="text-[#6B6B6E]">
                <UploadIcon />
              </span>
              <span className="text-base font-medium">点击上传商品图</span>
              <span className="text-xs text-[#9A9A9E]">JPG · PNG · WEBP</span>
            </button>
            {error && (
              <p className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={fileName ?? "已上传商品"}
              className="w-full rounded-2xl border border-[#E5E5E7] bg-white object-contain shadow-sm"
            />
            {fileName && (
              <p className="truncate text-center text-xs text-[#9A9A9E]" title={fileName}>
                {fileName}
              </p>
            )}

            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="flex-1 rounded-full border border-[#E5E5E7] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA] disabled:opacity-50"
              >
                重新上传
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className="flex-1 rounded-full border border-[#E5E5E7] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA] disabled:opacity-50"
              >
                移除
              </button>
            </div>

            <div className="flex w-full flex-col gap-3">
              <p className="text-sm font-medium text-[#1A1A1A]">选择场景</p>
              <div className="flex flex-col gap-2">
                {SCENES.map((s) => {
                  const active = scene === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={loading}
                      onClick={() => setScene(s.id)}
                      className={
                        "flex w-full flex-col gap-1 rounded-2xl border bg-white px-4 py-3 text-left transition disabled:opacity-50 " +
                        (active
                          ? "border-[#1A1A1A] ring-2 ring-[#1A1A1A] ring-offset-1 ring-offset-[#F7F7F8]"
                          : "border-[#E5E5E7] hover:border-[#9A9A9E]")
                      }
                    >
                      <span className="text-base font-medium text-[#1A1A1A]">
                        {s.label}
                      </span>
                      <span className="text-xs text-[#6B6B6E]">{s.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={!scene || loading}
              className="w-full rounded-full bg-[#1A1A1A] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#000000] disabled:cursor-not-allowed disabled:bg-[#9A9A9E]"
            >
              {loading ? "生成中…" : "立即生成"}
            </button>

            {error && (
              <div className="flex w-full flex-col gap-2">
                <p className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={loading}
                  className="w-full rounded-full border border-[#E5E5E7] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA] disabled:opacity-50"
                >
                  重试
                </button>
              </div>
            )}

            {loading && (
              <div className="flex w-full animate-pulse flex-col items-center gap-3 rounded-2xl border border-[#E5E5E7] bg-white p-6 text-xs text-[#6B6B6E]">
                <div className="h-32 w-full rounded-xl bg-[#F0F0F2]" />
                <span>AI 正在生成,通常需要 30-60 秒,请保持页面打开…</span>
              </div>
            )}

            {resultUrl && !loading && (
              <div className="flex w-full flex-col gap-3">
                <p className="text-sm font-medium text-[#1A1A1A]">生成结果</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="生成的商品场景图"
                  className="w-full rounded-2xl border border-[#E5E5E7] bg-white object-contain shadow-sm"
                />
                <button
                  type="button"
                  onClick={downloadResult}
                  className="w-full rounded-full bg-[#22C55E] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#16A34A]"
                >
                  下载图片
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="mt-auto pt-6 text-center text-xs text-[#9A9A9E]">
          轻图 LightPic · AI驱动的电商商品图工具
        </footer>
      </div>
    </main>
  );
}
