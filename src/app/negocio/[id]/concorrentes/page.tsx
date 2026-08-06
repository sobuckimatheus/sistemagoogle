import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { deixarDeRastrear } from "./acoes";
import { BuscaConcorrentes } from "./busca";

export const dynamic = "force-dynamic";

/** Variação entre o primeiro e o último snapshot do concorrente. */
function evolucao(
  snapshots: { reviewCount: number | null; rating: number | null }[],
) {
  if (snapshots.length < 2) return null;
  const primeiro = snapshots[snapshots.length - 1];
  const ultimo = snapshots[0];
  return {
    avaliacoes:
      ultimo.reviewCount !== null && primeiro.reviewCount !== null
        ? ultimo.reviewCount - primeiro.reviewCount
        : null,
    nota:
      ultimo.rating !== null && primeiro.rating !== null
        ? Number((ultimo.rating - primeiro.rating).toFixed(2))
        : null,
  };
}

export default async function ConcorrentesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const [concorrentes, minhasAvaliacoes] = await Promise.all([
    prisma.competitor.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "asc" },
      include: {
        snapshots: { orderBy: { capturedAt: "desc" }, take: 12 },
      },
    }),
    prisma.review.aggregate({
      where: { businessId: id },
      _count: true,
      _avg: { starRating: true },
    }),
  ]);

  const sugestao = [negocio.primaryCategory, negocio.city]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Concorrentes</h1>
        <p className="text-sm text-neutral-500">
          Quem aparece nas mesmas buscas que você, com dados públicos do Google.
        </p>
      </header>

      <BuscaConcorrentes
        businessId={id}
        sugestao={sugestao}
        jaRastreados={concorrentes.map((c) => c.placeId ?? "")}
      />

      {concorrentes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            Acompanhando ({concorrentes.length})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                  <th className="py-2 font-normal">Negócio</th>
                  <th className="py-2 font-normal">Nota</th>
                  <th className="py-2 font-normal">Avaliações</th>
                  <th className="py-2 font-normal">Evolução</th>
                  <th className="py-2 font-normal">Site</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                  <td className="py-2 font-medium">{negocio.title} (você)</td>
                  <td className="py-2 tabular-nums">
                    {minhasAvaliacoes._avg.starRating?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2 tabular-nums">
                    {minhasAvaliacoes._count}
                  </td>
                  <td className="py-2 text-neutral-400">—</td>
                  <td className="py-2">{negocio.website ? "sim" : "não"}</td>
                  <td />
                </tr>

                {concorrentes.map((c) => {
                  const ultimo = c.snapshots[0];
                  const delta = evolucao(c.snapshots);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-neutral-200 dark:border-neutral-800"
                    >
                      <td className="py-2">
                        <span className="flex flex-col">
                          <span>{c.name}</span>
                          {c.address && (
                            <span className="text-xs text-neutral-500">
                              {c.address}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums">
                        {ultimo?.rating?.toFixed(1) ?? "—"}
                      </td>
                      <td className="py-2 tabular-nums">
                        {ultimo?.reviewCount ?? "—"}
                      </td>
                      <td className="py-2 text-xs tabular-nums">
                        {delta?.avaliacoes !== null &&
                        delta?.avaliacoes !== undefined ? (
                          <span
                            className={
                              delta.avaliacoes > 0
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-neutral-500"
                            }
                          >
                            {delta.avaliacoes > 0 ? "+" : ""}
                            {delta.avaliacoes} avaliações
                          </span>
                        ) : (
                          <span className="text-neutral-400">
                            aguardando 2º snapshot
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {ultimo?.hasWebsite ? "sim" : "não"}
                      </td>
                      <td className="py-2 text-right">
                        <form action={deixarDeRastrear}>
                          <input
                            type="hidden"
                            name="competitorId"
                            value={c.id}
                          />
                          <button className="text-xs text-neutral-500 underline">
                            remover
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-neutral-500">
            A coluna de evolução compara o snapshot mais antigo com o mais
            recente. Um concorrente ganhando avaliações mais rápido que você é
            o sinal que importa — nota alta com volume baixo pesa pouco.
          </p>
        </section>
      )}
    </main>
  );
}
