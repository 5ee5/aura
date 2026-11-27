import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-xs rounded-lg border border-line bg-surface p-6">
        <h1 className="mb-6 font-display text-3xl">Aura</h1>
        <LoginForm />
      </div>
    </main>
  );
}
