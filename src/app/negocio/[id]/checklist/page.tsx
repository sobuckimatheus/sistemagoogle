import Link from "next/link";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import {
  notaPorFator,
  oportunidades,
  type Fator,
  type ItemChecklist,
} from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";

import { marcarItem } from "./acoes";

export const dynamic = "force-dynamic";

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 } as const;

const NOME_DO_FATOR: Record<Fator, { titulo: string; explica: string }> = {
  relevancia: {
    titulo: "Relevância",
    explica:
      "O quanto seu perfil casa com o que a pessoa buscou. É o que você resolve hoje, editando o perfil.",
  },
  destaque: {
    titulo: "Destaque",
    explica:
      "O quanto o Google considera seu negócio conhecido e ativo. Vem de avaliação e constância — leva semanas, não uma tarde.",
  },
  distancia: {
    titulo: "Distância",
    explica: "Não entra na nota: o endereço é o que é.",
  },
};

function corDaNota(nota: number): string {
  if (nota >= 80) return "text-green-600 dark:text-green-400";
  if (nota >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const [itens, snapshot] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { businessId: id },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.auditSnapshot.findFirst({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // O snapshot guarda a auditoria inteira — nota, peso e o que passou. O
  // checklist só tem as pendências, então sem ele a tela não teria como
  // mostrar o que já está bom.
  const criterios = (snapshot?.checksJson as unknown as ItemChecklist[]) ?? [];

  // Snapshot gravado antes da auditoria por fatores não tem `fator`, e a
  // leitura por fator sairia zerada. Melhor omitir a seção do que exibir
  // "Relevância 0" para um perfil que ninguém mediu assim — o próximo sync
  // grava no formato novo e ela aparece sozinha.
  const temFatores = criterios.every((c) => c.fator !== undefined);

  const bons = criterios.filter((c) => c.status === "ok");
  const ruins = oportunidades(criterios);
  const naoAvaliados = criterios.filter((c) => c.status === "indisponivel");
  const fatores =
    criterios.length > 0 && temFatores ? notaPorFator(criterios) : [];

  const abertos = itens
    .filter((i) => i.status === "OPEN")
    .sort(
      (a, b) =>
        (ORDEM_PRIORIDADE[a.priority as keyof typeof ORDEM_PRIORIDADE] ?? 3) -
        (ORDEM_PRIORIDADE[b.priority as keyof typeof ORDEM_PRIORIDADE] ?? 3),
    );
  const resolvidos = itens.filter((i) => i.status !== "OPEN");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link
          href={`/negocio/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {negocio.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Auditoria do perfil
        </h1>
        <p className="text-sm text-neutral-500">
          A nota mede o que decide posição no Maps, não campos preenchidos.
        </p>
      </header>

      {!snapshot ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          A auditoria ainda não rodou para este negócio. Ela acontece no sync
          diário e no momento em que o negócio é conectado.
        </p>
      ) : (
        <>
          {/* Nota e a leitura por fator */}
          <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-5xl font-semibold tabular-nums ${corDaNota(snapshot.score)}`}
              >
                {snapshot.score}
              </span>
              <span className="text-sm text-neutral-500">
                de 100 · medido em{" "}
                {snapshot.createdAt.toLocaleDateString("pt-BR")}
              </span>
            </div>

            {fatores.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {fatores.map((f) => (
                  <div
                    key={f.fator}
                    className="flex flex-col gap-1 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {NOME_DO_FATOR[f.fator].titulo}
                      </span>
                      <span
                        className={`text-lg font-semibold tabular-nums ${corDaNota(f.score)}`}
                      >
                        {f.score}
                      </span>
                    </span>
                    <span className="text-xs text-neutral-500">
                      {NOME_DO_FATOR[f.fator].explica}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* O que falta para chegar na primeira posição */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight">
                O que falta para a primeira posição
              </h2>
              <p className="text-sm text-neutral-500">
                Em ordem de impacto: o de cima é o que mais está te segurando.
              </p>
            </div>

            {ruins.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nenhum critério pendente. O que decide agora é constância —
                avaliações novas e publicações.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ruins.map((c) => {
                  const perdido = c.peso * (1 - c.pontuacao);
                  return (
                    <li
                      key={c.label}
                      className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              c.prioridade === "alta"
                                ? "bg-red-500"
                                : c.prioridade === "media"
                                  ? "bg-amber-500"
                                  : "bg-neutral-400"
                            }`}
                          />
                          <span className="text-sm font-medium">{c.label}</span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                          +{perdido.toFixed(0)} pts
                        </span>
                      </span>
                      <p className="pl-3.5 text-sm text-neutral-600 dark:text-neutral-400">
                        {c.dica}
                      </p>
                      {c.referencia && (
                        <p className="pl-3.5 text-xs text-neutral-500">
                          {c.referencia}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* O que já está bom */}
          {bons.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                O que já está bom ({bons.length})
              </h2>
              <ul className="flex flex-wrap gap-2">
                {bons.map((c) => (
                  <li
                    key={c.label}
                    className="rounded-full border border-green-300 px-3 py-1 text-xs text-green-800 dark:border-green-900 dark:text-green-300"
                  >
                    {c.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Sinal ausente é declarado, nunca contado como zero */}
          {naoAvaliados.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Fora da nota</h2>
              <p className="text-xs text-neutral-500">
                Estes critérios não entraram no cálculo porque ainda não
                sincronizamos o dado. Não contam como zero — a nota é sobre o
                que foi medido.
              </p>
              <ul className="flex flex-wrap gap-2">
                {naoAvaliados.map((c) => (
                  <li
                    key={c.label}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-700"
                  >
                    {c.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Plano de ação: o que o usuário marcou como feito ou dispensou */}
      {itens.length > 0 && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Plano de ação ({abertos.length})
            </h2>
            {abertos.length === 0 ? (
              <p className="text-sm text-neutral-500">Nada pendente.</p>
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
