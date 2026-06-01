"use client";

import { useRef, useState, useEffect } from "react";

type StepId = "input" | "analyzing" | "plan" | "generating" | "complete";

const STEPS: { id: StepId; label: string }[] = [
  { id: "input", label: "上传商品图" },
  { id: "analyzing", label: "AI 分析卖点" },
  { id: "plan", label: "确认方案" },
  { id: "generating", label: "生成图片" },
  { id: "complete", label: "下载使用" },
];

const CATEGORIES = [
  { id: "beauty", label: "美妆护肤" },
  { id: "food", label: "食品饮品" },
  { id: "home", label: "家居日用" },
  { id: "fashion", label: "服饰配件" },
  { id: "appliance", label: "小家电" },
] as const;
type CategoryId = typeof CATEGORIES[number]["id"];

const PLATFORMS = [
  { id: "pdd", label: "拼多多" },
  { id: "taobao", label: "淘宝" },
  { id: "douyin", label: "抖音" },
  { id: "xiaohongshu", label: "小红书" },
] as const;
type PlatformId = typeof PLATFORMS[number]["id"];

const OUTPUT_MODES = [
  { id: "visual", label: "纯视觉图" },
  { id: "copy", label: "带文案商品图" },
] as const;
type OutputModeId = typeof OUTPUT_MODES[number]["id"];

const OUTPUT_LANGUAGES = [
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "th", label: "Thai" },
] as const;
type OutputLanguageId = typeof OUTPUT_LANGUAGES[number]["id"];

const PLATFORM_SPEC = {
  name: "拼多多",
  rules: [
    "白底主图: 750×750 px,纯白底,产品居中,不可加文字水印",
    "场景图/详情图: 800×800 px 或 750×1000 px",
    "支持格式: JPG / PNG,单图 ≤ 1MB",
  ],
};

type Brief = {
  product_type: string;
  selling_points: string[];
  pain_points: string[];
  visual_style: string;
  main_title: string;
  subtitle: string;
};

type GeneratedItem = {
  status: "pending" | "loading" | "done" | "error";
  imageUrl?: string;
  error?: string;
};

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
      width="36"
      height="36"
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

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StepIndicator({ current }: { current: StepId }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <li key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium transition-colors " +
                  (isDone
                    ? "bg-[#111111] text-white"
                    : isCurrent
                      ? "bg-[#111111] text-white ring-3 ring-[#111111]/10"
                      : "bg-[#E5DED2] text-[#A09890]")
                }
              >
                {isDone ? <CheckIcon /> : idx + 1}
              </div>
              <span
                className={
                  "hidden text-[10px] sm:inline " +
                  (isCurrent
                    ? "font-semibold text-[#111111]"
                    : isDone
                      ? "font-medium text-[#7A756B]"
                      : "text-[#A09890]")
                }
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={"mx-2 h-px w-6 transition-colors " + (isDone ? "bg-[#111111]" : "bg-[#DED6C9]")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-[#E5DED2] bg-[#FFFCF6] p-4 shadow-sm " +
        className
      }
    >
      {children}
    </div>
  );
}

function CardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#A09890]">
        {title}
      </h3>
      <div className="text-sm text-[#111111]">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "w-full rounded-lg bg-[#111111] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2B2925] disabled:cursor-not-allowed disabled:bg-[#C8C0B4] " +
        (rest.className ?? "")
      }
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "w-full rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-5 py-2.5 text-sm font-medium text-[#2B2925] transition hover:bg-[#EAE4DA] disabled:opacity-50 " +
        (rest.className ?? "")
      }
    >
      {children}
    </button>
  );
}

function GreenButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={
        "w-full rounded-lg bg-[#111111] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2B2925] disabled:cursor-not-allowed disabled:opacity-50 " +
        (rest.className ?? "")
      }
    >
      {children}
    </button>
  );
}

export default function Home() {
  const [step, setStep] = useState<StepId>("input");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState<string>("");
  const [category, setCategory] = useState<CategoryId>("beauty");
  const [platform, setPlatform] = useState<PlatformId>("pdd");
  const [outputMode, setOutputMode] = useState<OutputModeId>("copy");
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguageId>("zh");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxIdx === null) return;
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowRight") setLightboxIdx((i) => i !== null ? Math.min(i + 1, results.length - 1) : null);
      if (e.key === "ArrowLeft") setLightboxIdx((i) => i !== null ? Math.max(i - 1, 0) : null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, results.length]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setResults([]);
    setStep("input");
    setPreviewUrl(null);
    setOriginalFile(null);
    setImageDataUrl(null);
    setProductDescription("");
    setCategory("beauty");
    setPlatform("pdd");
    setOutputMode("copy");
    setOutputLanguage("zh");
    setBrief(null);
    setError(null);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

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
    setPreviewUrl(URL.createObjectURL(file));
    setOriginalFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function startAnalyze() {
    if (!originalFile) return;
    setError(null);
    setNotice(null);
    setStep("analyzing");
    try {
      const dataUrl = await fileToDataUrl(originalFile);
      setImageDataUrl(dataUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl, productDescription: productDescription.trim() || undefined }),
          signal: controller.signal,
        });
        let data: { brief?: Brief; unsupported?: boolean; reason?: string; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`分析服务返回异常 (HTTP ${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || `分析失败 (HTTP ${res.status})`);
        if (data.unsupported) {
          setNotice(
            data.reason ||
              "目前 LightPic 只支持护肤品类(面霜、精华、洁面、防晒等),其他品类正在筹备中。",
          );
          setStep("input");
          return;
        }
        if (!data.brief) throw new Error("分析失败:未返回方案");
        setBrief(data.brief);
        setStep("plan");
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("分析超时(>60 秒),请重试");
      } else {
        setError(e instanceof Error ? e.message : "分析失败,请重试");
      }
      setStep("input");
    }
  }

  // Returns a single GeneratedItem without touching React state.
  async function generateSingle(currentBrief: Brief, dataUrl: string): Promise<GeneratedItem> {
    const MAX_ATTEMPTS = 3;
    let lastErr = "生成失败";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 125_000);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl, brief: currentBrief, nonce: Date.now() }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        let data: { imageUrl?: string; error?: string } = {};
        try { data = await res.json(); } catch { /* ignore */ }
        if (res.status === 429 && attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) { lastErr = data.error || `生成失败 (HTTP ${res.status})`; continue; }
        if (!data.imageUrl) { lastErr = "生成失败:未返回图片地址"; continue; }
        return { status: "done", imageUrl: data.imageUrl };
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof DOMException && e.name === "AbortError"
          ? "生成超时,请重试"
          : e instanceof Error ? e.message : "生成失败";
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
        }
      }
    }
    return { status: "error", error: lastErr };
  }

  async function runBatchTest(currentBrief: Brief, dataUrl: string, count = 5) {
    // Initialise all slots as loading
    setResults(Array.from({ length: count }, () => ({ status: "loading" as const })));
    setStep("generating");
    for (let i = 0; i < count; i++) {
      const item = await generateSingle(currentBrief, dataUrl);
      setResults((prev) => {
        const next = [...prev];
        next[i] = item;
        return next;
      });
      if (i < count - 1) await new Promise((r) => setTimeout(r, 2_000));
    }
    setStep("complete");
  }

  async function generateOne(currentBrief: Brief, dataUrl: string) {
    setResults([{ status: "loading" }]);
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const requestId = `fe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nonce = Date.now();
      console.log("[generateOne] requestId:", requestId, "| nonce:", nonce, "| attempt:", attempt, "| startedAt:", new Date().toISOString());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 125_000);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl, brief: currentBrief, nonce }),
          signal: controller.signal,
        });
        let data: { imageUrl?: string; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`服务器返回异常 (HTTP ${res.status})`);
        }
        console.log("[generateOne] requestId:", requestId, "| status:", res.status, "| imageUrl length:", data.imageUrl?.length ?? 0, "| imageUrl prefix:", data.imageUrl?.slice(0, 40) ?? "(none)");
        if (res.status === 429 && attempt < MAX_ATTEMPTS - 1) {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) throw new Error(data.error || `生成失败 (HTTP ${res.status})`);
        if (!data.imageUrl) throw new Error("生成失败:未返回图片地址");
        setResults([{ status: "done", imageUrl: data.imageUrl }]);
        clearTimeout(timer);
        return;
      } catch (e) {
        clearTimeout(timer);
        const is429 = e instanceof Error && e.message.includes("429");
        if (is429 && attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
          continue;
        }
        const msg =
          e instanceof DOMException && e.name === "AbortError"
            ? "生成超时,请重试"
            : e instanceof Error
              ? e.message
              : "生成失败";
        setResults([{ status: "error", error: msg }]);
        return;
      }
    }
  }

  async function startGenerate() {
    if (!brief || !imageDataUrl) return;
    setError(null);
    setStep("generating");
    await generateOne(brief, imageDataUrl);
    setStep("complete");
  }

  async function regenerateAll() {
    if (!brief || !imageDataUrl) return;
    setStep("generating");
    await generateOne(brief, imageDataUrl);
    setStep("complete");
  }

  async function downloadOne(idx: number) {
    const item = results[idx];
    const url = item?.imageUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `lightpic-main.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("下载失败,请长按图片保存");
    }
  }

  async function downloadAll() {
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "done") {
        await downloadOne(i);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // === LEFT PANE ===

  function renderLeftPane() {
    if (step === "input") {
      return (
        <div className="flex flex-col gap-3">
          {/* Upload */}
          <Card>
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#111111]">上传商品图</h2>
                <p className="mt-0.5 text-xs text-[#A09890]">支持 JPG · PNG · WEBP，建议白底或简单背景</p>
              </div>
              <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-[#D8D0C3] bg-[#F6F2E8] px-6 py-7 text-[#111111] transition hover:border-[#111111] hover:bg-[#EFE9DC]"
                >
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewUrl} alt="已上传商品" className="max-h-44 w-auto rounded-lg bg-white object-contain shadow-sm" />
                  ) : (
                    <>
                      <span className="text-[#C8C0B4]"><UploadIcon /></span>
                      <span className="text-sm font-medium text-[#7A756B]">点击或拖拽上传</span>
                    </>
                  )}
                </button>
              </div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {previewUrl && (
                <div className="flex w-full gap-2">
                  <SecondaryButton onClick={() => inputRef.current?.click()}>重新上传</SecondaryButton>
                  <SecondaryButton onClick={reset}>移除</SecondaryButton>
                </div>
              )}
            </div>
          </Card>

          {/* Category */}
          <Card>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#2B2925]">商品品类</h3>
                <span className="rounded bg-[#EDE7DC] px-1.5 py-0.5 text-[10px] text-[#7A756B]">重点测试品类</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                    className={"rounded-full border px-3 py-1 text-xs font-medium transition " +
                      (category === c.id
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#DED6C9] bg-[#F1EDE5] text-[#6F6A60] hover:border-[#2B2925] hover:text-[#2B2925]")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Platform */}
          <Card>
            <div className="flex flex-col gap-2.5">
              <h3 className="text-xs font-semibold text-[#2B2925]">目标平台</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {PLATFORMS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
                    className={"rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
                      (platform === p.id
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#DED6C9] bg-[#F1EDE5] text-[#6F6A60] hover:border-[#2B2925] hover:text-[#2B2925]")}>
                    {p.label}
                  </button>
                ))}
              </div>
              {platform !== "pdd" && (
                <p className="text-[10px] text-[#A09890]">当前版本以拼多多规格生成，其他平台适配即将上线</p>
              )}
            </div>
          </Card>

          {/* Output mode */}
          <Card>
            <div className="flex flex-col gap-2.5">
              <h3 className="text-xs font-semibold text-[#2B2925]">输出模式</h3>
              <div className="flex rounded-lg border border-[#DED6C9] bg-[#EDE7DC] p-0.5">
                {OUTPUT_MODES.map((m) => (
                  <button key={m.id} type="button" onClick={() => setOutputMode(m.id)}
                    className={"flex-1 rounded-md py-1.5 text-xs font-medium transition " +
                      (outputMode === m.id
                        ? "bg-[#FFFCF6] text-[#111111] shadow-sm"
                        : "text-[#7A756B] hover:text-[#2B2925]")}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Output language */}
          <Card>
            <div className="flex flex-col gap-2.5">
              <h3 className="text-xs font-semibold text-[#2B2925]">输出语言</h3>
              <div className="flex flex-wrap gap-1.5">
                {OUTPUT_LANGUAGES.map((l) => (
                  <button key={l.id} type="button" onClick={() => setOutputLanguage(l.id)}
                    className={"rounded-full border px-3 py-1 text-xs font-medium transition " +
                      (outputLanguage === l.id
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#DED6C9] bg-[#F1EDE5] text-[#6F6A60] hover:border-[#2B2925] hover:text-[#2B2925]")}>
                    {l.label}
                  </button>
                ))}
              </div>
              {outputLanguage !== "zh" && (
                <p className="text-[10px] text-[#A09890]">多语言文案即将上线，当前以中文生成</p>
              )}
            </div>
          </Card>

          {/* Brief — empty state before upload; AI draft appears after analyze */}
          <Card>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#2B2925]">商品 Brief</h3>
                <span className="rounded bg-[#EDE7DC] px-1.5 py-0.5 text-[10px] text-[#7A756B]">AI 自动生成</span>
              </div>
              {previewUrl ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[#D8D0C3] bg-[#F6F2E8] px-3 py-3">
                  <p className="text-xs text-[#7A756B]">点击「开始分析」后，AI 将自动生成商品 brief 草稿，你可以在确认方案时修改。</p>
                  <textarea
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="可选：补充特殊要求，如「主打保湿补水，适合干皮，无香精无酒精」"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-[#DED6C9] bg-[#FFFCF6] px-3 py-2 text-xs text-[#111111] placeholder-[#C8C0B4] outline-none focus:border-[#111111]"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[#D8D0C3] bg-[#F6F2E8] px-3 py-4 text-center">
                  <p className="text-xs text-[#A09890]">上传商品图后，AI 将自动生成商品 brief 草稿。</p>
                </div>
              )}
            </div>
          </Card>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          {notice && (
            <div className="flex gap-2 rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-3 py-2.5 text-xs text-[#7A756B]">
              <span aria-hidden="true">ℹ</span>
              <span>{notice}</span>
            </div>
          )}

          <PrimaryButton onClick={startAnalyze} disabled={mounted && !originalFile}>
            开始分析
          </PrimaryButton>
        </div>
      );
    }

    if (step === "analyzing") {
      return (
        <Card>
          <div className="flex flex-col items-center gap-4 py-6">
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="已上传商品" className="max-h-36 w-auto rounded-lg border border-[#E5DED2] bg-white object-contain shadow-sm" />
            )}
            <div className="flex flex-col items-center gap-2">
              <svg className="spin-slow text-[#111111]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <p className="text-sm font-medium text-[#111111]">AI 分析中</p>
              <p className="text-xs text-[#A09890]">通常 10–20 秒</p>
            </div>
          </div>
        </Card>
      );
    }

    if (step === "plan") {
      return (
        <div className="flex flex-col gap-3">
          <Card>
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="原图" className="mb-3 max-h-48 w-full rounded-xl border border-[#E5DED2] bg-white object-contain shadow-sm" />
            )}
            <p className="text-xs text-[#7A756B]">原图预览</p>
          </Card>

          {/* Brief summary */}
          {brief && (
            <Card>
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-[#111111]">AI 分析结果</h3>
                <div className="flex flex-col gap-1.5 rounded-lg bg-[#F6F2E8] px-3 py-2.5 text-xs">
                  <div className="flex gap-2">
                    <span className="shrink-0 text-[#A09890]">产品类型</span>
                    <span className="text-[#2B2925]">{brief.product_type}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 text-[#A09890]">主标题</span>
                    <span className="font-medium text-[#111111]">{brief.main_title}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#A09890]">核心卖点</span>
                    <ul className="flex flex-col gap-0.5 pl-1">
                      {brief.selling_points.map((sp, i) => (
                        <li key={i} className="flex gap-1.5 text-[#2B2925]">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#111111]" />
                          {sp}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <PrimaryButton onClick={startGenerate}>确认 Brief，开始生成</PrimaryButton>
          <SecondaryButton
            onClick={() => { if (brief && imageDataUrl) runBatchTest(brief, imageDataUrl); }}
            disabled={!brief || !imageDataUrl}
          >
            稳定性测试 ×5（串行生成）
          </SecondaryButton>
          <SecondaryButton onClick={reset}>重新上传</SecondaryButton>
          <button type="button" onClick={startAnalyze}
            className="w-full rounded-lg border border-[#DED6C9] bg-transparent px-5 py-2 text-xs font-medium text-[#7A756B] transition hover:bg-[#F1EDE5]">
            换一版 Brief
          </button>
        </div>
      );
    }

    if (step === "generating" || step === "complete") {
      return (
        <Card>
          {previewUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="原图" className="mb-3 max-h-48 w-full rounded-xl border border-[#E5DED2] bg-white object-contain shadow-sm" />
          )}
          <p className="text-xs text-[#7A756B]">原图</p>
          {step === "complete" && (
            <div className="mt-4 flex flex-col gap-2">
              <SecondaryButton onClick={regenerateAll}>重新生成</SecondaryButton>
              <SecondaryButton onClick={reset}>换一张图</SecondaryButton>
            </div>
          )}
        </Card>
      );
    }

    return null;
  }

  // === RIGHT PANE ===

  function renderRightPane() {
    if (step === "input") {
      return (
        <div className="flex flex-col gap-3">
          {/* Workspace canvas area */}
          <div className="rounded-xl border border-[#DED6C9] bg-[#E8E3D8] p-5 shadow-sm">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#A09890]">AI 将为你完成</p>
            <div className="flex flex-col gap-2.5">
              {[
                { icon: "🔍", title: "识别商品品类与外观特征", desc: "自动判断产品类型、颜色、包装形态" },
                { icon: "✨", title: "提炼核心卖点与差异化优势", desc: "从视觉信息中提取 3 个可用于文案的卖点" },
                { icon: "🎨", title: "规划 4 张图片的用途与构图", desc: "主视觉图 · 痛点图 · 场景图 · 卖点图" },
                { icon: "📝", title: "生成每张图的独立文案", desc: "主标题 · 副标题 · 卖点短句，可编辑" },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3 rounded-lg bg-[#F8F5EE] px-3 py-2.5 shadow-sm">
                  <span className="mt-0.5 text-base leading-none">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-[#2B2925]">{title}</p>
                    <p className="mt-0.5 text-xs text-[#A09890]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Output preview placeholder */}
          <div className="rounded-xl border border-dashed border-[#D8D0C3] bg-[#EDE8DF] p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#A09890]">生成结果预览区</p>
            <div className="aspect-square w-full rounded-lg border border-[#D8D0C3] bg-[#F8F5EE] shadow-sm" />
            <p className="mt-3 text-center text-xs text-[#A09890]">上传商品图后，AI 将自动生成主图</p>
          </div>
        </div>
      );
    }

    if (step === "analyzing") {
      return (
        <div className="rounded-xl border border-[#DED6C9] bg-[#E8E3D8] p-5 shadow-sm">
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A09890]">分析进行中</p>
            <div className="flex flex-col gap-2.5 pt-1">
              {[
                "识别产品品类与外观特征",
                "提取核心卖点与差异化优势",
                "规划 4 张场景图方案",
                "生成每张图独立文案",
              ].map((label, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="skeleton h-2 w-2 shrink-0 rounded-full" />
                  <div className="skeleton h-2.5 rounded" style={{ width: `${60 + i * 8}%` }} />
                  <span className="sr-only">{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[#A09890]">方案即将生成...</p>
          </div>
        </div>
      );
    }

    if (step === "plan" && brief) {
      return (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-4">
              <CardSection title="产品识别">
                <p className="font-medium">{brief.product_type}</p>
              </CardSection>

              <CardSection title="核心卖点">
                <ul className="flex flex-col gap-1">
                  {brief.selling_points.map((sp, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span>{sp}</span>
                    </li>
                  ))}
                </ul>
              </CardSection>

              <CardSection title="主标题方向">
                <p className="rounded-lg bg-[#F1EDE5] px-3 py-2 font-medium">{brief.main_title}</p>
              </CardSection>

              <CardSection title="视觉风格">
                <p className="text-[#6B6660]">{brief.visual_style}</p>
              </CardSection>
            </div>
          </Card>

          <Card>
            <CardSection title={`${PLATFORM_SPEC.name} 平台规范`}>
              <ul className="flex flex-col gap-1 text-xs text-[#7A756B]">
                {PLATFORM_SPEC.rules.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            </CardSection>
          </Card>
        </div>
      );
    }

    if ((step === "generating" || step === "complete") && results.length > 0) {
      const anyLoading = results.some((r) => r.status === "loading");
      const isBatch = results.length > 1;
      return (
        <div className="flex flex-col gap-3">
          {/* Status bar */}
          <div className="flex items-center justify-between rounded-xl border border-[#E5DED2] bg-[#FFFCF6] px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              {step === "complete" ? (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#111111] text-white">
                    <CheckIcon />
                  </span>
                  <span className="text-sm font-medium text-[#111111]">
                    {isBatch ? `生成完成（共 ${results.length} 张）` : "生成完成"}
                  </span>
                </>
              ) : (
                <>
                  <svg className="spin-slow text-[#111111]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span className="text-sm font-medium text-[#111111]">
                    {isBatch
                      ? `生成中 ${results.filter((r) => r.status !== "loading").length}/${results.length}`
                      : "生成中"}
                  </span>
                </>
              )}
            </div>
            {anyLoading && (
              <span className="text-xs text-[#A09890]">约 60–90 秒/张</span>
            )}
          </div>

          {step === "complete" && (
            <div className="rounded-xl border border-[#E5DED2] bg-[#FFFCF6] px-4 py-3 shadow-sm">
              <p className="text-[11px] text-[#A09890]">
                AI 生成结果建议人工复核后使用，尤其是商品主体、品牌标识和功效表述。
              </p>
            </div>
          )}

          {/* Image grid — 1 col for single, 2 col for batch */}
          <div className={isBatch ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
            {results.map((r, idx) => (
              <div key={idx} className="overflow-hidden rounded-xl border border-[#E5DED2] bg-[#FFFCF6] shadow-sm">
                <div className="flex items-center justify-between border-b border-[#EDE7DC] px-3 py-2">
                  <span className="text-xs font-medium text-[#111111]">
                    {isBatch ? `第 ${idx + 1} 张` : "主图"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {r.status === "done" && (
                      <span className="rounded bg-[#EDE7DC] px-1.5 py-0.5 text-[10px] text-[#7A756B]">1024×1024</span>
                    )}
                    {r.status === "loading" && (
                      <span className="flex items-center gap-1 text-[11px] text-[#A09890]">
                        <svg className="spin-slow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        生成中
                      </span>
                    )}
                    {r.status === "error" && (
                      <span className="text-[11px] text-red-500">失败</span>
                    )}
                  </div>
                </div>

                <div className="p-3">
                  <div
                    className={"aspect-square w-full overflow-hidden rounded-lg border border-[#E5DED2] bg-[#F1EDE5] " + (r.status === "done" ? "cursor-zoom-in" : "")}
                    onClick={() => r.status === "done" && setLightboxIdx(idx)}
                    title={r.status === "done" ? "点击查看大图" : undefined}
                  >
                    {r.status === "done" && r.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={r.imageUrl} alt={`生成主图 ${idx + 1}`} className="h-full w-full object-contain" />
                    ) : r.status === "error" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
                        <span className="text-xs text-red-500">{r.error ?? "生成失败"}</span>
                      </div>
                    ) : (
                      <div className="skeleton h-full w-full" />
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.status === "done" && (
                      <>
                        <button type="button" onClick={() => setLightboxIdx(idx)}
                          className="rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-2.5 py-1.5 text-xs font-medium text-[#2B2925] transition hover:bg-[#EAE4DA]">
                          大图
                        </button>
                        <button type="button" onClick={() => downloadOne(idx)}
                          className="rounded-lg bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#2B2925]">
                          下载
                        </button>
                      </>
                    )}
                    {r.status === "error" && (
                      <button type="button"
                        onClick={() => { if (brief && imageDataUrl) generateOne(brief, imageDataUrl); }}
                        className="rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-2.5 py-1.5 text-xs font-medium text-[#2B2925] transition hover:bg-[#EAE4DA]">
                        重试
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {step === "complete" && (
            <div className="flex gap-2">
              <button type="button" onClick={regenerateAll}
                className="flex-1 rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-5 py-2.5 text-sm font-medium text-[#2B2925] transition hover:bg-[#EAE4DA]">
                重新生成
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#F6F3EA] text-[#111111]">
      {/* Lightbox */}
      {lightboxIdx !== null && results[lightboxIdx] && (() => {
        const r = results[lightboxIdx];
        const url = r.imageUrl;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onClick={() => setLightboxIdx(null)}
          >
            <div
              className="relative flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-[#FFFCF6] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-[#111111]">主图大图预览</span>
                <button
                  type="button"
                  onClick={() => setLightboxIdx(null)}
                  className="shrink-0 rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-2.5 py-1.5 text-xs font-medium text-[#2B2925] transition hover:bg-[#EAE4DA]"
                  aria-label="关闭"
                >
                  关闭
                </button>
              </div>

              {/* Image */}
              <div className="overflow-hidden rounded-xl border border-[#E5DED2] bg-[#F1EDE5]">
                {url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt="生成主图" className="w-full object-contain" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-[#A09890]">暂无图片</div>
                )}
              </div>

              {/* Review notice */}
              <p className="text-[11px] text-[#A09890]">
                使用前请复核商品结构、品牌标识、包装文字和文案是否与真实商品一致。
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadOne(lightboxIdx)}
                  disabled={r.status !== "done"}
                  className="flex-1 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2B2925] disabled:cursor-not-allowed disabled:bg-[#C8C0B4]"
                >
                  下载
                </button>
                <button
                  type="button"
                  disabled={!brief || !imageDataUrl || r.status === "loading"}
                  onClick={() => {
                    if (!brief || !imageDataUrl) return;
                    generateOne(brief, imageDataUrl);
                  }}
                  className="flex-1 rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-4 py-2.5 text-sm font-medium text-[#2B2925] transition hover:bg-[#EAE4DA] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {r.status === "loading" ? "生成中…" : "重新生成"}
                </button>
              </div>

            </div>
          </div>
        );
      })()}
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 py-5 sm:py-6">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#E5DED2] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111111]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-[#111111]">LightPic</h1>
                <span className="rounded bg-[#EDE7DC] px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-[#7A756B]">Beta</span>
              </div>
              <p className="text-[11px] text-[#A09890]">AI 商品图工作台</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-[#DED6C9] bg-[#F1EDE5] px-2.5 py-1 text-[11px] font-medium text-[#7A756B]">
              {PLATFORMS.find(p => p.id === platform)?.label ?? "拼多多"}
            </span>
            <span className="rounded-md border border-[#DED6C9] bg-[#F1EDE5] px-2.5 py-1 text-[11px] font-medium text-[#7A756B]">
              {CATEGORIES.find(c => c.id === category)?.label ?? "美妆护肤"}
            </span>
          </div>
        </header>

        {/* Hero */}
        <div className="rounded-xl border border-[#E5DED2] bg-[#FFFCF6] px-6 py-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <div className="flex flex-col gap-3 lg:max-w-xl">
              <h2 className="text-xl font-semibold leading-snug text-[#111111]">
                上传一张商品图，生成一套电商视觉方案
              </h2>
              <p className="text-sm text-[#6B6660] leading-relaxed">
                AI 自动分析商品特征、提炼卖点、规划主视觉图、场景图和卖点图，帮助小团队快速获得可复核的商品图初稿。
              </p>
              <p className="text-xs text-[#A09890]">
                传统商品图制作成本高、沟通慢、反复改；LightPic 先帮助你快速生成可复核的视觉初稿。
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-lg bg-[#111111] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2B2925]"
                >
                  开始生成
                </button>
                {/* 查看示例：前端占位，暂无真实示例区，点击滚动到工作台 */}
                <button
                  type="button"
                  onClick={() => workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-lg border border-[#DED6C9] bg-[#F1EDE5] px-5 py-2.5 text-sm font-medium text-[#2B2925] transition hover:bg-[#EAE4DA]"
                >
                  查看示例
                </button>
              </div>
            </div>
            <div className="shrink-0">
              <StepIndicator current={step} />
            </div>
          </div>
        </div>

        {/* Capability matrix */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              title: "商品图方案",
              status: "当前可用",
              statusColor: "bg-[#D1FAE5] text-[#065F46]",
              desc: "上传商品图，生成主视觉图、场景图、卖点图，形成一套可复核的商品图初稿。",
            },
            {
              title: "主图 & 详情图",
              status: "当前可用",
              statusColor: "bg-[#D1FAE5] text-[#065F46]",
              desc: "AI 规划商品图用途与详情页卖点结构，帮助快速形成电商视觉初稿。",
            },
            {
              title: "风格参考 / 爆款复刻",
              status: "规划中",
              statusColor: "bg-[#EDE7DC] text-[#7A756B]",
              desc: "参考优秀商品图的构图、配色和视觉语言，生成相似风格方案。",
            },
            {
              title: "多平台适配",
              status: "部分可用",
              statusColor: "bg-[#FEF3C7] text-[#92400E]",
              desc: "面向拼多多、淘宝、小红书等平台调整视觉表达与文案语气。",
            },
          ].map(({ title, status, statusColor, desc }) => (
            <div key={title} className="flex flex-col gap-2 rounded-xl border border-[#E5DED2] bg-[#FFFCF6] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[#111111]">{title}</p>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor}`}>{status}</span>
              </div>
              <p className="text-xs text-[#7A756B] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Workbench */}
        <div ref={workbenchRef} className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-[#111111]">商品图生成工作台</h3>
            <p className="text-xs text-[#A09890]">上传商品图，补充 brief，生成一套可下载、可人工复核的商品图方案。</p>
          </div>
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
          <div className="flex flex-col gap-3">
            {renderLeftPane()}
          </div>
          <div className="flex flex-col gap-3">
            {renderRightPane()}
          </div>
        </div>
        </div>

        <footer className="mt-auto pt-3 text-center text-[11px] text-[#C8C0B4]">
          LightPic · 轻图 · AI 驱动的电商商品图工具
        </footer>
      </div>
    </main>
  );
}
