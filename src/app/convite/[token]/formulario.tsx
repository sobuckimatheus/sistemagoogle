"use client";

import { useActionState } from "react";

import { aceitarConvite, type EstadoConvite } from "./acoes";

export function FormularioAceite({
  token,
  nomeDaConta,
}: {
  token: string;
  nomeDaConta: string;
}) {
  const [estado, acao, pendente] = useActionState<EstadoConvite, FormData>(
    aceitarConvite,
    null,
  );

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      {estado && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pendente ? "Entrando…" : `Entrar na conta ${nomeDaConta}`}
      </button>
    </form>
  );
}
