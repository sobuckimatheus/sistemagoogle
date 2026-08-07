"use client";

import { trocarConta } from "@/app/actions/conta";

/**
 * Troca de conta ativa para quem participa de mais de uma (E1-07).
 *
 * Some quando há só uma conta: um seletor de item único é ruído em uma tela
 * que já tem muito o que dizer.
 */
export function SeletorDeConta({
  contas,
  ativa,
}: {
  contas: { id: string; nome: string }[];
  ativa: string;
}) {
  if (contas.length < 2) return null;

  return (
    <form action={trocarConta}>
      <label className="sr-only" htmlFor="accountId">
        Conta ativa
      </label>
      <select
        id="accountId"
        name="accountId"
        defaultValue={ativa}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      {/* Fallback para quem estiver sem JavaScript: o onChange não dispara,
          mas o botão continua submetendo o formulário. */}
      <noscript>
        <button type="submit" className="ml-2 text-sm underline">
          Trocar
        </button>
      </noscript>
    </form>
  );
}
