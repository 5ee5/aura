import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
      <h1 className="font-display text-3xl">Page not found</h1>
      <Link href="/" className="text-accent underline underline-offset-4">
        Go to Coach
      </Link>
    </main>
  );
}
