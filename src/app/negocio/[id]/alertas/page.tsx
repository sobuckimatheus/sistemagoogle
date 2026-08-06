import Link from "next/link";
import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DESTINO: Record<string, (id: string) => string> = {
  NEW_REVIEW: (id) => `/negocio/${id}/avaliacoes?filtro=sem-resposta`,
  LOW_RATING_REVIEW: (id) => `/negocio/${id}/avaliacoes?filtro=negativas`,
  RATING_DROP: (id) => `/negocio/${id}/avaliacoes`,
  NO_ACTIVITY: (id) => `/negocio/${id}`,
  RANK_DROP: (id) => `/negocio/${id}`,
  SYNC_FAILED: () => `/conectar`,
};

export default async function AlertasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const alertas = await prisma.alert.findMany({
    where: { businessId: id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  async function marcarTodosLidos() {
    "use server";
    const { conta } = await exigirContaAtiva();
    await exigirNegocioDaConta(id, conta.id);
    await prisma.alert.updateMany({
      where: { businessId: id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath(`/negocio/${id}/alertas`);
  }

  const naoLidos = alertas.filter((a) => !a.readAt).length;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={`/negocio/${id}`}
            className="text-xs text-neutral-500 hover:underline"
          >
            ← {negocio.title}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        </div>
        {naoLidos > 0 && (
          <form action={marcarTodosLidos}>
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
              Marcar {naoLidos} como lidos
            </button>
          </form>
        )}
      </header>

      {alertas.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum alerta. Eles são gerados pelo job diário, comparando o estado
          de hoje com o do dia anterior.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alertas.map((a) => (
            <li key={a.id}>
              <Link
                href={DESTINO[a.type]?.(id) ?? `/negocio/${id}`}
                className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
                  a.readAt
                    ? "border-neutral-200 opacity-60 dark:border-neutral-800"
                    : "border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.severity === "CRITICAL"
                      ? "bg-red-500"
                      : a.severity === "WARNING"
                        ? "bg-amber-500"
                        : "bg-neutral-400"
                  }`}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{a.message}</span>
                  <span className="text-xs text-neutral-500">
                    {a.createdAt.toLocaleString("pt-BR")}
                    {!a.readAt && " · não lido"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
