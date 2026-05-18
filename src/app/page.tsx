"use client";

import { useRef, useState } from "react";

type StepId = "input" | "analyzing" | "plan" | "generating" | "complete";

const STEPS: { id: StepId; label: string }[] = [
  { id: "input", label: "输入" },
  { id: "analyzing", label: "分析中" },
  { id: "plan", label: "确认方案" },
  { id: "generating", label: "生成中" },
  { id: "complete", label: "完成" },
];

const PLATFORM_SPEC = {
  name: "拼多多",
  rules: [
    "白底主图: 750×750 px,纯白底,产品居中,不可加文字水印",
    "场景图/详情图: 800×800 px 或 750×1000 px",
    "支持格式: JPG / PNG,单图 ≤ 1MB",
  ],
};

type ImagePlanItem = {
  id: "white-bg" | "lifestyle-scene" | "detail-closeup";
  title: string;
  purpose: string;
  prompt: string;
};

type AnalyzedPlan = {
  product_type: string;
  visual_features: string;
  selling_points: string[];
  visual_style: string;
  color_system: string;
  image_plan: ImagePlanItem[];
};

type GeneratedItem = {
  planItem: ImagePlanItem;
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
    <ol className="flex w-full items-center gap-1 sm:gap-2">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition " +
                  (isDone
                    ? "bg-[#2563EB] text-white"
                    : isCurrent
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-[#E5E5E7] text-[#9A9A9E]")
                }
              >
                {isDone ? <CheckIcon /> : idx + 1}
              </div>
              <span
                className={
                  "text-[11px] sm:text-xs " +
                  (isCurrent
                    ? "font-medium text-[#1A1A1A]"
                    : isDone
                      ? "text-[#2563EB]"
                      : "text-[#9A9A9E]")
                }
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={
                  "h-0.5 flex-1 transition " + (isDone ? "bg-[#2563EB]" : "bg-[#E5E5E7]")
                }
              />
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
        "rounded-2xl border border-[#E5E5E7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] " +
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6B6E]">
        {title}
      </h3>
      <div className="text-sm text-[#1A1A1A]">{children}</div>
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
        "w-full rounded-full bg-[#2563EB] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#9A9A9E] " +
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
        "w-full rounded-full border border-[#E5E5E7] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#FAFAFA] disabled:opacity-50 " +
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
        "w-full rounded-full bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#16A34A] disabled:cursor-not-allowed disabled:opacity-50 " +
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
  const [plan, setPlan] = useState<AnalyzedPlan | null>(null);
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep("input");
    setPreviewUrl(null);
    setOriginalFile(null);
    setImageDataUrl(null);
    setPlan(null);
    setResults([]);
    setError(null);
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
          body: JSON.stringify({ imageDataUrl: dataUrl }),
          signal: controller.signal,
        });
        let data: { plan?: AnalyzedPlan; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`分析服务返回异常 (HTTP ${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || `分析失败 (HTTP ${res.status})`);
        if (!data.plan) throw new Error("分析失败:未返回方案");
        setPlan(data.plan);
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

  async function generateOne(item: ImagePlanItem, idx: number, dataUrl: string) {
    setResults((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "loading" };
      return next;
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 95_000);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, prompt: item.prompt }),
        signal: controller.signal,
      });
      let data: { imageUrl?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`服务器返回异常 (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || `生成失败 (HTTP ${res.status})`);
      if (!data.imageUrl) throw new Error("生成失败:未返回图片地址");
      setResults((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: "done", imageUrl: data.imageUrl };
        return next;
      });
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "生成超时,请重试"
          : e instanceof Error
            ? e.message
            : "生成失败";
      setResults((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: "error", error: msg };
        return next;
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function startGenerate() {
    if (!plan || !imageDataUrl) return;
    setError(null);
    setStep("generating");
    setResults(
      plan.image_plan.map((p) => ({ planItem: p, status: "pending" })),
    );
    // Sequential, with a 2.5s gap between requests, to stay under
    // Replicate's per-second rate limit. Each generateOne handles its
    // own errors and never throws, so one failure doesn't abort the rest.
    for (let i = 0; i < plan.image_plan.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2500));
      await generateOne(plan.image_plan[i], i, imageDataUrl);
    }
    setStep("complete");
  }

  async function regenerateAll() {
    if (!plan || !imageDataUrl) return;
    setStep("generating");
    setResults(plan.image_plan.map((p) => ({ planItem: p, status: "pending" })));
    for (let i = 0; i < plan.image_plan.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2500));
      await generateOne(plan.image_plan[i], i, imageDataUrl);
    }
    setStep("complete");
  }

  async function downloadOne(idx: number) {
    const item = results[idx];
    if (!item?.imageUrl) return;
    try {
      const res = await fetch(item.imageUrl);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `lightpic-${item.planItem.id}.${ext}`;
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
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-[#1A1A1A]">
                上传商品图
              </h2>
              <p className="text-xs text-[#6B6B6E]">
                上传清晰的护肤品产品图,AI 将自动分析产品并生成 3 张专业商品图。
              </p>

              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center"
              >
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#D1D1D6] bg-[#FAFAFA] px-6 py-10 text-[#1A1A1A] transition hover:border-[#2563EB] hover:bg-[#F0F4FF]"
                >
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt="已上传商品"
                      className="max-h-56 w-auto rounded-xl bg-white object-contain"
                    />
                  ) : (
                    <>
                      <span className="text-[#6B6B6E]">
                        <UploadIcon />
                      </span>
                      <span className="text-sm font-medium">点击或拖拽上传</span>
                      <span className="text-xs text-[#9A9A9E]">
                        JPG · PNG · WEBP
                      </span>
                    </>
                  )}
                </button>
              </div>

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

              {previewUrl && (
                <div className="flex w-full gap-3">
                  <SecondaryButton onClick={() => inputRef.current?.click()}>
                    重新上传
                  </SecondaryButton>
                  <SecondaryButton onClick={reset}>移除</SecondaryButton>
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <PrimaryButton onClick={startAnalyze} disabled={!originalFile}>
                开始分析
              </PrimaryButton>
            </div>
          </Card>
        </div>
      );
    }

    if (step === "analyzing") {
      return (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="已上传商品"
                className="max-h-40 w-auto rounded-xl border border-[#E5E5E7] bg-white object-contain"
              />
            )}
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#E5E5E7]">
              <div className="h-full w-1/2 animate-pulse bg-[#2563EB]" />
            </div>
            <p className="text-sm font-medium text-[#1A1A1A]">AI 正在分析产品...</p>
            <p className="text-xs text-[#6B6B6E]">通常 10-20 秒</p>
          </div>
        </Card>
      );
    }

    if (step === "plan") {
      return (
        <div className="flex flex-col gap-4">
          <Card>
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="原图"
                className="mb-3 max-h-48 w-full rounded-xl border border-[#E5E5E7] bg-white object-contain"
              />
            )}
            <p className="text-xs text-[#6B6B6E]">原图预览</p>
          </Card>
          <PrimaryButton onClick={startGenerate}>确认,开始生成</PrimaryButton>
          <SecondaryButton onClick={reset}>重新上传</SecondaryButton>
        </div>
      );
    }

    if (step === "generating" || step === "complete") {
      return (
        <Card>
          {previewUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt="原图"
              className="mb-3 max-h-48 w-full rounded-xl border border-[#E5E5E7] bg-white object-contain"
            />
          )}
          <p className="text-xs text-[#6B6B6E]">原图</p>
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
        <Card>
          <div className="flex flex-col gap-3 text-sm text-[#6B6B6E]">
            <h3 className="text-base font-semibold text-[#1A1A1A]">使用说明</h3>
            <p>1. 上传一张清晰的护肤品产品图(白底或简单背景效果最好)</p>
            <p>2. AI 自动识别产品并生成专业方案</p>
            <p>3. 一次得到 3 张拼多多可用的商品图</p>
            <div className="mt-2 rounded-xl bg-[#F0F4FF] p-3 text-xs text-[#2563EB]">
              💡 当前优化方向:拼多多护肤品类
            </div>
          </div>
        </Card>
      );
    }

    if (step === "analyzing") {
      return (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="h-3 w-2/3 animate-pulse rounded bg-[#E5E5E7]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[#E5E5E7]" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-[#E5E5E7]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[#E5E5E7]" />
            <p className="mt-2 text-xs text-[#6B6B6E]">方案即将生成...</p>
          </div>
        </Card>
      );
    }

    if (step === "plan" && plan) {
      return (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-4">
              <CardSection title="产品识别">
                <div className="flex flex-col gap-1">
                  <p>
                    <span className="font-medium">产品类型: </span>
                    {plan.product_type}
                  </p>
                  <p className="text-[#6B6B6E]">{plan.visual_features}</p>
                </div>
              </CardSection>

              <CardSection title="核心卖点">
                <ul className="flex flex-col gap-1">
                  {plan.selling_points.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </CardSection>

              <CardSection title="视觉风格">
                <p className="rounded-lg bg-[#FAFAFA] px-3 py-2">{plan.visual_style}</p>
              </CardSection>

              <CardSection title="色彩系统">
                <p>{plan.color_system}</p>
              </CardSection>
            </div>
          </Card>

          <Card>
            <CardSection title="图片规划">
              <ol className="flex flex-col gap-3">
                {plan.image_plan.map((item, i) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 rounded-xl border border-[#E5E5E7] p-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-[#1A1A1A]">
                        {item.title}
                      </span>
                    </div>
                    <p className="ml-7 text-xs text-[#6B6B6E]">{item.purpose}</p>
                  </li>
                ))}
              </ol>
            </CardSection>
          </Card>

          <Card>
            <CardSection title={`${PLATFORM_SPEC.name} 平台规范`}>
              <ul className="flex flex-col gap-1 text-xs text-[#6B6B6E]">
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
      return (
        <div className="flex flex-col gap-4">
          {step === "complete" && (
            <div className="flex items-center gap-2 rounded-2xl border border-[#22C55E]/30 bg-[#F0FDF4] px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#22C55E] text-white">
                <CheckIcon />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-semibold text-[#16A34A]">生成完成</p>
                <p className="text-xs text-[#16A34A]/80">
                  {results.filter((r) => r.status === "done").length}/{results.length}{" "}
                  张已生成
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r, i) => (
              <Card key={i} className="!p-3">
                <div className="flex flex-col gap-2">
                  <div className="aspect-square w-full overflow-hidden rounded-xl border border-[#E5E5E7] bg-[#FAFAFA]">
                    {r.status === "done" && r.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.imageUrl}
                        alt={r.planItem.title}
                        className="h-full w-full object-cover"
                      />
                    ) : r.status === "error" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
                        <span className="text-xs font-semibold text-red-600">
                          生成失败
                        </span>
                        <span className="text-[10px] text-red-500">{r.error}</span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full animate-pulse items-center justify-center bg-[#F0F0F2]">
                        <span className="text-xs text-[#9A9A9E]">
                          {r.status === "loading" ? "生成中..." : "等待中"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 px-1">
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      {r.planItem.title}
                    </p>
                    <p className="truncate text-[11px] text-[#9A9A9E]">
                      {r.planItem.purpose}
                    </p>
                  </div>
                  {r.status === "done" ? (
                    <GreenButton onClick={() => downloadOne(i)}>下载图片</GreenButton>
                  ) : r.status === "error" ? (
                    <SecondaryButton
                      onClick={() => {
                        if (imageDataUrl) generateOne(r.planItem, i, imageDataUrl);
                      }}
                    >
                      重试
                    </SecondaryButton>
                  ) : (
                    <div className="h-9" />
                  )}
                </div>
              </Card>
            ))}
          </div>

          {step === "complete" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <GreenButton onClick={downloadAll}>批量下载</GreenButton>
              <SecondaryButton onClick={regenerateAll}>重新生成</SecondaryButton>
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#F7F7F8] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 px-4 py-6 sm:py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            轻图 LightPic · AI商品图生成
          </h1>
          <p className="text-xs text-[#6B6B6E] sm:text-sm">
            上传商品图,10秒生成专业电商场景图
          </p>
        </header>

        <Card className="!p-4">
          <StepIndicator current={step} />
        </Card>

        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="flex flex-col gap-4">
            {renderLeftPane()}
          </div>
          <div className="flex flex-col gap-4">
            {renderRightPane()}
          </div>
        </div>

        <footer className="mt-auto pt-6 text-center text-xs text-[#9A9A9E]">
          轻图 LightPic · AI驱动的电商商品图工具
        </footer>
      </div>
    </main>
  );
}
