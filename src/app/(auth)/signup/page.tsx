"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // signUp() always resolves without an error even when email
    // confirmation is required — the account is created, but no session
    // is issued until the user clicks the confirmation link. This used to
    // redirect to /home unconditionally either way, which meant an
    // unconfirmed signup would hit a real "Not authenticated" crash the
    // instant home/page.tsx's data fetch ran (proxy.ts's own auth check
    // happens on a separate request and can't retroactively stop a
    // client-side router.push that's already in flight with no session to
    // find) — landing a brand-new user straight on the app's generic error
    // boundary as their very first-ever impression of the product, with no
    // indication they just needed to check their inbox. Checking for a
    // session explicitly, rather than assuming signUp() succeeding means
    // "signed in," is what actually distinguishes the two cases.
    if (!data.session) {
      setCheckEmail(true);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-neutral-200 p-4 text-center sm:p-8">
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-neutral-500">
            We sent a confirmation link to <strong>{email}</strong>. Click it
            to activate your account, then come back and log in.
          </p>
          <Link href="/login" className="inline-block text-sm underline">
            Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 p-4 sm:p-8"
      >
        <h1 className="text-xl font-semibold">Create your account</h1>

        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>

        <p className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
