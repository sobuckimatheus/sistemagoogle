"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { EntrarComGoogle, OuEntao } from "@/components/entrar-com-google";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proximo = searchParams.get("proximo") ?? "/";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  // Erro vindo do callback (link expirado, troca de código falhou) chega na URL.
  const [erro, setErro] = useState<string | null>(searchParams.get("erro"));
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro(error.message);
      setEnviando(false);
      return;
    }

    // refresh() força o servidor a reavaliar a sessão antes de navegar.
    router.refresh();
    router.replace(proximo);
  }

  return (
    <form onSubmit={entrar} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Painel GBP</h1>
        <p className="text-sm text-neutral-500">Entre para continuar.</p>
      </div>

      <EntrarComGoogle proximo={proximo} />
      <OuEntao />

      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <Link
          href="/recuperar-senha"
          className="self-end text-xs text-neutral-500 underline"
        >
          Esqueci minha senha
        </Link>
      </label>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>

      <p className="text-sm text-neutral-500">
        Não tem conta?{" "}
        <Link href="/cadastro" className="underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      {/* useSearchParams exige Suspense para não forçar a página inteira a
          renderizar no cliente. */}
      <Suspense>
        <FormularioLogin />
      </Suspense>
    </main>
  );
}
