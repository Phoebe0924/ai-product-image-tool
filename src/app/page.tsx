"use client";

import { useRef, useState, useEffect } from "react";
import { synthesizeTemplate1, type CopyData } from "@/lib/canvas/template1";

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
  id: "scene-1" | "scene-2" | "scene-3" | "scene-4";
  layout_variant?: "A" | "B" | "C" | "D";
  title: string;
  purpose: string;
  prompt: string;
  copy: CopyData;
};

type AnalyzedPlan = {
  product_type: string;
  visual_features: string;
  selling_points: string[];
  visual_style: string;
  color_system: string;
  image_plan: ImagePlanItem[];
  copy?: CopyData;
};

type ScoreData = {
  ctrPotential: number;
  subjectClarity: number;
  pddMatch: number;
  aiTemplateFeeling: number;
  scoreSource: string;
};

type GeneratedItem = {
  planItem: ImagePlanItem;
  status: "pending" | "loading" | "done" | "composing" | "error";
  imageUrl?: string;       // raw base from Replicate
  composedUrl?: string;    // final canvas-synthesized image
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
    <ol className="flex w-full items-center">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <li key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-colors " +
                  (isDone
                    ? "bg-[#1A1A1A] text-white"
                    : isCurrent
                      ? "bg-[#1A1A1A] text-white ring-4 ring-[#1A1A1A]/10"
                      : "bg-[#E8E8EA] text-[#AEAEB2]")
                }
              >
                {isDone ? <CheckIcon /> : idx + 1}
              </div>
              <span
                className={
                  "text-[10px] tracking-wide " +
                  (isCurrent
                    ? "font-semibold text-[#1A1A1A]"
                    : isDone
                      ? "font-medium text-[#1A1A1A]"
                      : "text-[#AEAEB2]")
                }
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={
                  "mb-4 h-px flex-1 transition-colors " + (isDone ? "bg-[#1A1A1A]" : "bg-[#E8E8EA]")
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
        "rounded-xl border border-[#E8E8EA] bg-white p-5 " +
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
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#AEAEB2]">
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
        "w-full rounded-lg bg-[#1A1A1A] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#333] disabled:cursor-not-allowed disabled:bg-[#AEAEB2] " +
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
        "w-full rounded-lg border border-[#E8E8EA] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F5F5F7] disabled:opacity-50 " +
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
        "w-full rounded-lg bg-[#1A1A1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50 " +
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
  const [plan, setPlan] = useState<AnalyzedPlan | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [editedCopies, setEditedCopies] = useState<Record<string, CopyData>>({});
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep("input");
    setPreviewUrl(null);
    setOriginalFile(null);
    setImageDataUrl(null);
    setProductDescription("");
    setPlan(null);
    setScore(null);
    setEditedCopies({});
    setResults([]);
    setError(null);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Sync editedCopies whenever a new plan arrives
  useEffect(() => {
    if (plan?.image_plan) {
      const copies: Record<string, CopyData> = {};
      for (const item of plan.image_plan) {
        copies[item.id] = { ...item.copy, bullets: [...item.copy.bullets], side_badges: [...item.copy.side_badges] };
      }
      setEditedCopies(copies);
    } else {
      setEditedCopies({});
    }
  }, [plan]);

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
        let data: { plan?: AnalyzedPlan; score?: ScoreData; unsupported?: boolean; reason?: string; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`分析服务返回异常 (HTTP ${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || `分析失败 (HTTP ${res.status})`);
        // Non-skincare branch: server returned 200 with {unsupported: true, reason}.
        // Surface as a friendly notice on the input step, not an error.
        if (data.unsupported) {
          setNotice(
            data.reason ||
              "目前 LightPic 只支持护肤品类(面霜、精华、洁面、防晒等),其他品类正在筹备中。",
          );
          setStep("input");
          return;
        }
        if (!data.plan) throw new Error("分析失败:未返回方案");
        setPlan(data.plan);
        if (data.score) setScore(data.score as ScoreData);
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
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
        // 429: back off and retry
        if (res.status === 429 && attempt < MAX_ATTEMPTS - 1) {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 6_000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) throw new Error(data.error || `生成失败 (HTTP ${res.status})`);
        if (!data.imageUrl) throw new Error("生成失败:未返回图片地址");
        const baseUrl = data.imageUrl;
        setResults((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "done", imageUrl: baseUrl };
          return next;
        });

        // All 4 slots are scene images — all go through Canvas composition.
        const copy = editedCopies[item.id];
        if (copy) {
          setResults((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], status: "composing" };
            return next;
          });
          try {
            const composedUrl = await synthesizeTemplate1(baseUrl, copy, dataUrl, item.layout_variant);
            setResults((prev) => {
              const next = [...prev];
              next[idx] = { ...next[idx], status: "done", composedUrl };
              return next;
            });
          } catch (composeErr) {
            console.warn("Canvas composition failed:", composeErr);
            setResults((prev) => {
              const next = [...prev];
              next[idx] = { ...next[idx], status: "done" };
              return next;
            });
          }
        }
        clearTimeout(timer);
        return; // success
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
        setResults((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "error", error: msg };
          return next;
        });
        return;
      }
    }
  }

  async function startGenerate() {
    if (!plan || !imageDataUrl) return;
    setError(null);
    setStep("generating");
    setResults(
      plan.image_plan.map((p) => ({ planItem: p, status: "pending" })),
    );
    for (let i = 0; i < plan.image_plan.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 3_000));
      await generateOne(plan.image_plan[i], i, imageDataUrl);
    }
    setStep("complete");
  }

  async function regenerateAll() {
    if (!plan || !imageDataUrl) return;
    setStep("generating");
    setResults(plan.image_plan.map((p) => ({ planItem: p, status: "pending" })));
    for (let i = 0; i < plan.image_plan.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 3_000));
      await generateOne(plan.image_plan[i], i, imageDataUrl);
    }
    setStep("complete");
  }

  async function downloadOne(idx: number) {
    const item = results[idx];
    // Prefer the Canvas-composed image if available; fall back to raw Replicate output.
    const url = item?.composedUrl || item?.imageUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
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
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1A1A]">上传商品图</h2>
                <p className="mt-0.5 text-xs text-[#AEAEB2]">支持 JPG · PNG · WEBP，建议白底或简单背景</p>
              </div>

              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-[#D1D1D6] bg-[#F5F5F7] px-6 py-8 text-[#1A1A1A] transition hover:border-[#1A1A1A] hover:bg-[#F0F0F2]"
                >
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt="已上传商品"
                      className="max-h-52 w-auto rounded-lg bg-white object-contain"
                    />
                  ) : (
                    <>
                      <span className="text-[#AEAEB2]">
                        <UploadIcon />
                      </span>
                      <span className="text-sm font-medium text-[#6B6B6E]">点击或拖拽上传</span>
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
                <div className="flex w-full gap-2">
                  <SecondaryButton onClick={() => inputRef.current?.click()}>
                    重新上传
                  </SecondaryButton>
                  <SecondaryButton onClick={reset}>移除</SecondaryButton>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6B6B6E]">
                  产品描述 <span className="font-normal text-[#AEAEB2]">（可选）</span>
                </label>
                <input
                  type="text"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="如：护发素、洗发水、身体乳……"
                  className="rounded-lg border border-[#E8E8EA] bg-[#F5F5F7] px-3 py-2 text-sm outline-none focus:border-[#1A1A1A] focus:bg-white"
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {notice && (
                <div className="flex gap-2 rounded-lg border border-[#E8E8EA] bg-[#F5F5F7] px-3 py-2.5 text-xs text-[#6B6B6E]">
                  <span aria-hidden="true">ℹ</span>
                  <span>{notice}</span>
                </div>
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
          <div className="flex flex-col items-center gap-4 py-6">
            {previewUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="已上传商品"
                className="max-h-36 w-auto rounded-lg border border-[#E8E8EA] bg-white object-contain"
              />
            )}
            <div className="flex flex-col items-center gap-2">
              <svg className="spin-slow text-[#1A1A1A]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <p className="text-sm font-medium text-[#1A1A1A]">AI 分析中</p>
              <p className="text-xs text-[#AEAEB2]">通常 10–20 秒</p>
            </div>
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
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#AEAEB2]">工作流说明</p>
            <div className="flex flex-col gap-3">
              {[
                { step: "01", label: "上传商品图", desc: "白底或简单背景效果最佳" },
                { step: "02", label: "AI 分析方案", desc: "识别品类、卖点、视觉风格" },
                { step: "03", label: "确认并编辑文案", desc: "可修改每张图的标题与卖点" },
                { step: "04", label: "生成 4 张场景图", desc: "拼多多主图规格，可直接上传" },
              ].map(({ step: s, label, desc }) => (
                <div key={s} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-[#AEAEB2]">{s}</span>
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
                    <p className="text-xs text-[#AEAEB2]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-[#F5F5F7] px-3 py-2.5 text-xs text-[#6B6B6E]">
              当前支持品类：护肤品（面霜、精华、洁面、防晒等）
            </div>
          </div>
        </Card>
      );
    }

    if (step === "analyzing") {
      return (
        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#AEAEB2]">分析进行中</p>
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
            <p className="mt-1 text-[11px] text-[#AEAEB2]">方案即将生成...</p>
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

          {Object.keys(editedCopies).length > 0 && plan && (
            <Card>
              <CardSection title="文案编辑（按场景）">
                <div className="flex flex-col gap-6 pt-1">
                  {plan.image_plan.map((item) => {
                    const c = editedCopies[item.id];
                    if (!c) return null;
                    const setC = (updater: (prev: CopyData) => CopyData) =>
                      setEditedCopies((prev) => ({ ...prev, [item.id]: updater(prev[item.id]) }));
                    return (
                      <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#E5E5E7] p-3">
                        <p className="text-xs font-semibold text-[#1A1A1A]">{item.title}</p>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-[#6B6B6E]">主标题</label>
                          <input type="text" value={c.main_title}
                            onChange={(e) => setC((p) => ({ ...p, main_title: e.target.value }))}
                            className="rounded-lg border border-[#E5E5E7] bg-[#FAFAFA] px-3 py-1.5 text-sm outline-none focus:border-[#2563EB] focus:bg-white" />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-[#6B6B6E]">副标题</label>
                          <input type="text" value={c.sub_title}
                            onChange={(e) => setC((p) => ({ ...p, sub_title: e.target.value }))}
                            className="rounded-lg border border-[#E5E5E7] bg-[#FAFAFA] px-3 py-1.5 text-sm outline-none focus:border-[#2563EB] focus:bg-white" />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-[#6B6B6E]">卖点（3条）</label>
                          {c.bullets.map((b, i) => (
                            <input key={i} type="text" value={b}
                              onChange={(e) => setC((p) => { const bullets = [...p.bullets]; bullets[i] = e.target.value; return { ...p, bullets }; })}
                              className="rounded-lg border border-[#E5E5E7] bg-[#FAFAFA] px-3 py-1.5 text-sm outline-none focus:border-[#2563EB] focus:bg-white"
                              placeholder={`卖点 ${i + 1}`} />
                          ))}
                        </div>

                        <button type="button"
                          onClick={() => setC(() => ({ ...item.copy, bullets: [...item.copy.bullets], side_badges: [...item.copy.side_badges] }))}
                          className="self-start text-[11px] text-[#6B6B6E] underline underline-offset-2 hover:text-[#1A1A1A]">
                          恢复此场景原始文案
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardSection>
            </Card>
          )}
        </div>
      );
    }

    if ((step === "generating" || step === "complete") && results.length > 0) {
      const doneCount = results.filter((r) => r.status === "done").length;
      return (
        <div className="flex flex-col gap-4">
          {/* Status bar */}
          <div className="flex items-center justify-between rounded-xl border border-[#E8E8EA] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              {step === "complete" ? (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A1A1A] text-white">
                    <CheckIcon />
                  </span>
                  <span className="text-sm font-medium text-[#1A1A1A]">生成完成</span>
                </>
              ) : (
                <>
                  <svg className="spin-slow text-[#1A1A1A]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span className="text-sm font-medium text-[#1A1A1A]">生成中</span>
                </>
              )}
            </div>
            <span className="text-xs text-[#AEAEB2]">{doneCount} / {results.length} 张完成</span>
          </div>

          {/* Score */}
          {step === "complete" && score && (
            <div className="rounded-xl border border-[#E8E8EA] bg-white px-4 py-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#AEAEB2]">文案评分</p>
                <span className="rounded bg-[#F0F0F2] px-2 py-0.5 text-[10px] text-[#6B6B6E]">规则评分 · 仅供参考</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { label: "CTR 潜力", value: score.ctrPotential },
                  { label: "主体清晰", value: score.subjectClarity },
                  { label: "平台匹配", value: score.pddMatch },
                  { label: "AI 模板感", value: score.aiTemplateFeeling, invert: true },
                ] as { label: string; value: number; invert?: boolean }[]).map(({ label, value, invert }) => {
                  const good = invert ? value < 60 : value >= 70;
                  const mid = invert ? value < 75 : value >= 55;
                  const color = good ? "#1A1A1A" : mid ? "#D97706" : "#DC2626";
                  return (
                    <div key={label} className="flex flex-col items-center gap-1 rounded-lg bg-[#F5F5F7] py-2.5">
                      <span className="text-[10px] text-[#AEAEB2]">{label}</span>
                      <span className="text-base font-semibold" style={{ color }}>{value}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-[#AEAEB2]">AI 模板感越低越好</p>
            </div>
          )}

          {/* Image workflow — vertical list like an e-commerce detail page */}
          <div className="flex flex-col gap-3">
            {results.map((r, i) => (
              <div key={i} className="rounded-xl border border-[#E8E8EA] bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#F0F0F2] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F0F0F2] text-[10px] font-semibold text-[#6B6B6E]">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-[#1A1A1A]">{r.planItem.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "done" && (
                      <span className="rounded bg-[#F0F0F2] px-2 py-0.5 text-[10px] text-[#6B6B6E]">800×800</span>
                    )}
                    {r.status === "loading" && (
                      <span className="text-[11px] text-[#AEAEB2]">生成中...</span>
                    )}
                    {r.status === "composing" && (
                      <span className="text-[11px] text-[#AEAEB2]">合成文案...</span>
                    )}
                    {r.status === "pending" && (
                      <span className="text-[11px] text-[#AEAEB2]">等待中</span>
                    )}
                    {r.status === "error" && (
                      <span className="text-[11px] text-red-500">失败</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 p-4">
                  {/* Image */}
                  <div className="aspect-square w-48 shrink-0 overflow-hidden rounded-lg border border-[#E8E8EA] bg-[#F5F5F7]">
                    {r.status === "done" && (r.composedUrl || r.imageUrl) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.composedUrl || r.imageUrl}
                        alt={r.planItem.title}
                        className="h-full w-full object-cover"
                      />
                    ) : r.status === "error" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
                        <span className="text-xs text-red-500">生成失败</span>
                      </div>
                    ) : (
                      <div className="skeleton h-full w-full" />
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#AEAEB2]">场景说明</p>
                      <p className="text-sm text-[#1A1A1A]">{r.planItem.purpose}</p>
                    </div>
                    <div className="flex gap-2">
                      {r.status === "done" ? (
                        <button
                          type="button"
                          onClick={() => downloadOne(i)}
                          className="rounded-lg bg-[#1A1A1A] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#333]"
                        >
                          下载
                        </button>
                      ) : r.status === "error" ? (
                        <button
                          type="button"
                          onClick={() => { if (imageDataUrl) generateOne(r.planItem, i, imageDataUrl); }}
                          className="rounded-lg border border-[#E8E8EA] px-4 py-2 text-xs font-medium text-[#1A1A1A] transition hover:bg-[#F5F5F7]"
                        >
                          重试
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {step === "complete" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={downloadAll}
                className="flex-1 rounded-lg bg-[#1A1A1A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#333]"
              >
                批量下载
              </button>
              <button
                type="button"
                onClick={regenerateAll}
                className="flex-1 rounded-lg border border-[#E8E8EA] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#F5F5F7]"
              >
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
    <main className="flex min-h-screen flex-col bg-[#F5F5F7] text-[#1A1A1A]">
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-4 py-5 sm:py-7">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#E8E8EA] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A1A1A]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">LightPic</h1>
              <p className="text-[11px] text-[#AEAEB2]">AI 电商主图生成</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#F0F0F2] px-2.5 py-1 text-[11px] font-medium text-[#6B6B6E]">拼多多</span>
            <span className="rounded-md bg-[#F0F0F2] px-2.5 py-1 text-[11px] font-medium text-[#6B6B6E]">护肤品类</span>
          </div>
        </header>

        {/* Step bar */}
        <div className="rounded-xl border border-[#E8E8EA] bg-white px-5 py-4">
          <StepIndicator current={step} />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <div className="flex flex-col gap-4">
            {renderLeftPane()}
          </div>
          <div className="flex flex-col gap-4">
            {renderRightPane()}
          </div>
        </div>

        <footer className="mt-auto pt-4 text-center text-[11px] text-[#AEAEB2]">
          LightPic · 轻图 · AI 驱动的电商商品图工具
        </footer>
      </div>
    </main>
  );
}
