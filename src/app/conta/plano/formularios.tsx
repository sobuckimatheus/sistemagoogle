"use client";

import { useActionState } from "react";

import { abrirPortal, irParaCheckout, type EstadoPlano } from "./acoes";

function Erro({ estado }: { estado: EstadoPlano }) {
  if (!estado) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {estado.erro}
    </p>
  );
}

export function BotaoAssinar({
  planId,
  rotulo,
  desabilitado,
}: {
  planId: string;
  rotulo: string;
  desabilitado?: boolean;
}) {
  const [estado, acao, pendente] = useActionState<EstadoPlano, FormData>(
    irParaCheckout,
    null,
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={acao}>
        <input type="hidden" name="planId" value={planId} />
        <button
          type="submit"
          disabled={pendente || desabilitado}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pendente ? "Abrindo checkout…" : rotulo}
        </button>
      </form>
      <Erro estado={estado} />
    </div>
  );
}

export function BotaoPortal() {
  const [estado, acao, pendente] = useActionState<EstadoPlano, FormData>(
    abrirPortal,
    null,
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={acao}>
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          {pendente ? "Abrindo…" : "Gerenciar assinatura e faturas"}
        </button>
      </form>
      <Erro estado={estado} />
    </div>
  );
}
