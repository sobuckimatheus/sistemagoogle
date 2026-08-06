"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientEnv } from "@/lib/env/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarEmail, setConfirmarEmail] = useState(false);

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { name: nome },
        emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      setErro(error.message);
      setEnviando(false);
      return;
    }

    // Com confirmação de e-mail ativa no Supabase, signUp devolve usuário mas
    // não devolve sessão — o acesso só existe depois do clique no e-mail.
    if (!data.session) {
      setConfirmarEmail(true);
      setEnviando(false);
      return;
    }

    router.refresh();
    router.replace("/");
  }

  if (confirmarEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Confirme seu e-mail
          </h1>
          <p className="text-sm text-neutral-500">
            Enviamos um link para <strong>{email}</strong>. Abra o link para
            ativar a conta e entrar.
          </p>
          <Link href="/login" className="text-sm underline">
            Voltar para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={cadastrar} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Criar conta</h1>
          <p className="text-sm text-neutral-500">
            Comece a acompanhar seu Perfil de Empresa no Google.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Nome
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

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
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-xs text-neutral-500">Mínimo 8 caracteres.</span>
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
          {enviando ? "Criando…" : "Criar conta"}
        </button>

        <p className="text-sm text-neutral-500">
          Já tem conta?{" "}
          <Link href="/login" className="underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
