import { logout } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/dal";

export default async function Home() {
  await requireSession();

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Aura</h1>
      <form action={logout}>
        <button type="submit" className="mt-4 rounded-md border px-3 py-2">
          Sign out
        </button>
      </form>
    </main>
  );
}
