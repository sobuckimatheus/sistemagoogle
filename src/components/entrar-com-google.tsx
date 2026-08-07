"use client";

import { useState } from "react";

import { clientEnv } from "@/lib/env/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Login social com Google (E1-02).
 *
 * Escopo de identidade apenas — nada de Business Profile aqui. A conexão com o
 * GBP é outro fluxo (`/api/google/connect`), com escopo próprio, consentimento
 * offline e token guardado cifrado. Misturar os dois faria o usuário conceder
 * acesso ao negócio dele só para entrar no app, e ainda deixaria o refresh
 * token do produto amarrado ao login.
 */
export function EntrarComGoogle({ proximo = "/" }: { proximo?: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  async function entrar() {
    setIndo(true);
    setErro(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?proximo=${encodeURIComponent(proximo)}`,
      },
    });

    // Sem erro, o navegador já está saindo para o consent do Google — não
    // adianta desligar o "indo", e piscar o botão de volta confundiria.
    if (error) {
      setErro(error.message);
      setIndo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={entrar}
        disabled={indo}
        className="flex items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        <svg aria-hidden viewBox="0 0 48 48" className="size-4">
          <path
            fill="#4285F4"
            d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"
          />
          <path
            fill="#34A853"
            d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.1 15.4 46 24 46z"
          />
          <path
            fill="#FBBC05"
            d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C3 17 2.2 20.4 2.2 24s.8 7 2.3 9.9l7.3-5.7z"
          />
          <path
            fill="#EA4335"
            d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 8 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
          />
        </svg>
        {indo ? "Abrindo o Google…" : "Continuar com o Google"}
      </button>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Separador visual entre o social e o formulário de e-mail e senha. */
export function OuEntao() {
  return (
    <div className="flex items-center gap-3 text-xs text-neutral-400">
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      ou
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
