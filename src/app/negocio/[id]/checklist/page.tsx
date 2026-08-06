import Link from "next/link";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { marcarItem } from "./acoes";

export const dynamic = "force-dynamic";

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 } as const;

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const itens = await prisma.checklistItem.findMany({
    where: { businessId: id },
    orderBy: { generatedAt: "desc" },
  });

  const abertos = itens
    .filter((i) => i.status === "OPEN")
    .sort(
      (a, b) =>
        (ORDEM_PRIORIDADE[a.priority as keyof typeof ORDEM_PRIORIDADE] ?? 3) -
        (ORDEM_PRIORIDADE[b.priority as keyof typeof ORDEM_PRIORIDADE] ?? 3),
    );
  const resolvidos = itens.filter((i) => i.status !== "OPEN");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link
          href={`/negocio/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {negocio.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Plano de ação</h1>
        <p className="text-sm text-neutral-500">
          Gerado pela auditoria. Itens marcados como feitos ou dispensados não
          voltam no próximo sync.
        </p>
      </header>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          A auditoria ainda não rodou para este negócio. Ela acontece no sync
          diário e no momento em que o negócio é conectado.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">
              Pendentes ({abertos.length})
            </h2>
            {abertos.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nada pendente. Bom sinal.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {abertos.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          item.priority === "alta"
                            ? "bg-red-500"
                            : item.priority === "media"
                              ? "bg-amber-500"
                              : "bg-neutral-400"
                        }`}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-neutral-500">
                          {item.area} · prioridade {item.priority}
                        </span>
                        {item.description && (
                          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pl-3.5">
                      <form action={marcarItem}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="status" value="DONE" />
                        <button className="rounded-md border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">
                          Marcar como feito
                        </button>
                      </form>
                      <form action={marcarItem}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="status" value="DISMISSED" />
                        <button className="rounded-md px-3 py-1 text-xs text-neutral-500">
                          Dispensar
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {resolvidos.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">
                Resolvidos e dispensados ({resolvidos.length})
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {resolvidos.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
                  >
                    <span className="flex flex-col">
                      <span className="text-neutral-500 line-through">
                        {item.title}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {item.status === "DONE" ? "feito" : "dispensado"}
                        {item.resolvedAt &&
                          ` em ${item.resolvedAt.toLocaleDateString("pt-BR")}`}
                      </span>
                    </span>
                    <form action={marcarItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="status" value="OPEN" />
                      <button className="text-xs text-neutral-500 underline">
                        reabrir
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
