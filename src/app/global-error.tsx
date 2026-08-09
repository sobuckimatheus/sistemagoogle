"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Último anteparo do App Router.
 *
 * `error.tsx` cobre erro dentro do layout; este cobre erro **no próprio
 * layout raiz**, quando nem a moldura da aplicação renderizou. Por isso ele
 * precisa declarar `<html>` e `<body>`: não existe nada em volta dele.
 *
 * É também o único lugar onde um erro de renderização escaparia sem registro,
 * então é aqui que ele é reportado antes de virar tela.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center px-6">
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Algo quebrou aqui do nosso lado
          </h1>
          <p className="text-sm text-neutral-500">
            O erro foi registrado e vamos olhar. Seus dados não foram
            perdidos — nada é apagado por uma falha de tela.
          </p>
          {error.digest && (
            <p className="text-xs text-neutral-400">
              Código para suporte: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
