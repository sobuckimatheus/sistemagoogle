export default function Loading() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <div className="h-7 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      <div className="h-32 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
    </main>
  );
}
