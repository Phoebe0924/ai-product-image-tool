"use client";

import { useRef, useState } from "react";

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
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
                className="flex-1 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Remove
              </button>
            </div>

            <button
              type="button"
              disabled
              className="mt-2 w-full cursor-not-allowed rounded-full bg-black px-5 py-3 text-sm font-medium text-white opacity-50 dark:bg-white dark:text-black"
            >
              Generate scene (coming in Step 3)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
