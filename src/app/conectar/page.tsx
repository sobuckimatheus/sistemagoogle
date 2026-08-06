import Link from "next/link";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ConectarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { erro } = await searchParams;

  const conexoes = await prisma.googleConnection.findMany({
    where: { accountId: conta.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { businesses: true } } },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Conectar o Google Meu Negócio
        </h1>
        <p className="text-sm text-neutral-500">
          Autorize o acesso para ler métricas, avaliações e editar o perfil.
        </p>
      </header>

      {erro && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {erro}
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Autorizar com sua conta Google</h2>
          <p className="text-sm text-neutral-500">
            Use a conta que administra o Perfil de Empresa. Se você é agência, o
            caminho com menos atrito é o cliente adicionar seu e-mail como
            gerente no próprio perfil — assim uma conta Google sua acessa vários
            clientes.
          </p>
        </div>
        <Link
          href="/api/google/connect"
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Conectar com o Google
        </Link>
      </section>

      {conexoes.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Conexões desta conta</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {conexoes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4">
                <span className="text-neutral-600 dark:text-neutral-400">
                  {c.googleAccountEmail ?? "conta Google"} · {c._count.businesses}{" "}
                  {c._count.businesses === 1 ? "negócio" : "negócios"}
                </span>
                <span
                  className={
                    c.status === "ACTIVE"
                      ? "text-xs text-green-700 dark:text-green-400"
                      : "text-xs text-red-700 dark:text-red-400"
                  }
                >
                  {c.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          {conexoes.some((c) => c.status === "ACTIVE") && (
            <Link
              href={`/conectar/locais?conexao=${
                conexoes.find((c) => c.status === "ACTIVE")!.id
              }`}
              className="self-start text-sm underline"
            >
              Escolher locais para rastrear
            </Link>
          )}
        </section>
      )}

      <Link href="/" className="text-sm underline">
        Voltar
      </Link>
    </main>
  );
}
