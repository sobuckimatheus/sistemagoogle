"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(E10-06): enviar para o Sentry quando a observabilidade entrar.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-24">
      <h1 className="text-xl font-semibold">Algo quebrou aqui</h1>
      <p className="text-sm text-neutral-500">
        O erro foi registrado. Você pode tentar de novo — se persistir, o
        problema está do nosso lado.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-neutral-400">
          referência: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Tentar novamente
      </button>
    </main>
  );
}
