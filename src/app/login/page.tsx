import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Aura" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <h1 className="mb-6 text-2xl font-semibold">Aura</h1>
        <LoginForm />
      </div>
    </main>
  );
}
