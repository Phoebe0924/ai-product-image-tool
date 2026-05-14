"use client";

import { useRef, useState } from "react";

const SCENES = [
  { id: "marble-kitchen", label: "Marble Kitchen" },
  { id: "wood-table", label: "Wood Table" },
  { id: "outdoor-cafe", label: "Outdoor Cafe" },
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
    if (!file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setOriginalFile(file);
    setResultUrl(null);
    setError(null);
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
    try {
      const imageDataUrl = await fileToDataUrl(originalFile);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, scene }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generation failed");
      setResultUrl(data.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            AI Product Photo
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Turn a plain product shot into a lifestyle scene in seconds.
          </p>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {!previewUrl ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-6 py-12 text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <span className="block text-base font-medium">Tap to upload a product photo</span>
            <span className="mt-1 block text-xs text-zinc-500">JPG, PNG, or WEBP</span>
          </button>
        ) : (
          <div className="flex w-full flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={fileName ?? "Uploaded product"}
              className="w-full rounded-2xl border border-zinc-200 bg-white object-contain shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            />
            {fileName && (
              <p className="truncate text-xs text-zinc-500" title={fileName}>
                {fileName}
              </p>
            )}

            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="flex-1 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className="flex-1 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Remove
              </button>
            </div>

            <div className="mt-2 flex w-full flex-col gap-2">
              <p className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Choose a scene
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SCENES.map((s) => {
                  const active = scene === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={loading}
                      onClick={() => setScene(s.id)}
                      className={
                        "rounded-xl border px-2 py-3 text-xs font-medium transition disabled:opacity-50 " +
                        (active
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800")
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={!scene || loading}
              className="mt-2 w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {loading ? "Generating…" : "Generate scene"}
            </button>

            {error && (
              <p className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}

            {loading && (
              <div className="flex w-full animate-pulse flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-6 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="h-32 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                <span>Generating, this usually takes 10–30 seconds…</span>
              </div>
            )}

            {resultUrl && !loading && (
              <div className="flex w-full flex-col items-center gap-3">
                <p className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Result
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="Generated lifestyle scene"
                  className="w-full rounded-2xl border border-zinc-200 bg-white object-contain shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                />
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="w-full rounded-full border border-zinc-300 bg-white px-5 py-3 text-center text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Open / download
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
