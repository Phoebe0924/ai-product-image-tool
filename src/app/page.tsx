export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
          AI Product Photo
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Turn a plain product shot into a lifestyle scene in seconds.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 cursor-not-allowed rounded-full bg-black px-6 py-3 text-white opacity-50 dark:bg-white dark:text-black"
        >
          Upload photo (coming in Step 2)
        </button>
      </div>
    </main>
  );
}
