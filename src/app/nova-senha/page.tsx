"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Define a senha nova depois do link de recuperação (E1-01).
 *
 * Só é alcançável com sessão: o `/auth/callback` já trocou o código do e-mail
 * por sessão antes de mandar para cá, e o middleware barra quem chega sem ela.
 * É o que garante que quem troca a senha é quem recebeu o e-mail.
 */
const MINIMO = 8;

export default function NovaSenhaPage() {
  const router = useRouter();

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < MINIMO) {
      setErro(`A senha precisa ter ao menos ${MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }

    setSalvando(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    router.refresh();
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={salvar} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Nova senha</h1>
          <p className="text-sm text-neutral-500">
            Defina a senha que você vai usar para entrar.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Nova senha
          <input
            type="password"
            required
            minLength={MINIMO}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Repita a nova senha
          <input
            type="password"
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {salvando ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    </main>
  );
}
