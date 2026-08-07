"use client";

import Link from "next/link";
import { useState } from "react";

import { clientEnv } from "@/lib/env/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * "Esqueci a senha" (E1-01).
 *
 * A tela responde a mesma coisa para e-mail cadastrado e não cadastrado. É
 * proposital: uma mensagem do tipo "e-mail não encontrado" transforma esta
 * página em um verificador de quem é cliente do produto.
 */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?proximo=/nova-senha`,
    });

    // Erro de rede ou de configuração aparece; "usuário não existe" não chega
    // aqui — o Supabase também não distingue, pelo mesmo motivo.
    if (error) {
      setErro(error.message);
      setEnviando(false);
      return;
    }

    setEnviado(true);
    setEnviando(false);
  }

  if (enviado) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Verifique seu e-mail
          </h1>
          <p className="text-sm text-neutral-500">
            Se houver uma conta para <strong>{email}</strong>, o link de
            redefinição chega em instantes. Ele vale por uma hora e só pode ser
            usado uma vez.
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
      <form onSubmit={enviar} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Recuperar senha
          </h1>
          <p className="text-sm text-neutral-500">
            Enviamos um link para você definir uma senha nova.
          </p>
        </div>

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
          {enviando ? "Enviando…" : "Enviar link"}
        </button>

        <p className="text-sm text-neutral-500">
          Lembrou?{" "}
          <Link href="/login" className="underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
