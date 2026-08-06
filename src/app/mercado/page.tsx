import Link from "next/link";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { FormularioMercado } from "./formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Análise de Mercado — Painel GBP" };

export default async function MercadoPage() {
  const { conta } = await exigirContaAtiva();

  const historico = await prisma.marketScan.findMany({
    where: { accountId: conta.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-xs text-neutral-500 hover:underline">
          ← início
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Análise de Mercado
        </h1>
        <p className="text-sm text-neutral-500">
          Descubra a posição de qualquer negócio no Maps — inclusive de quem
          ainda não é seu cliente. Usa dados públicos, sem exigir conexão com o
          Google.
        </p>
      </header>

      <FormularioMercado />

      {historico.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Análises anteriores</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {historico.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{h.businessName}</span>
                  <span className="text-xs text-neutral-500">
                    &ldquo;{h.keyword}&rdquo; ·{" "}
                    {h.createdAt.toLocaleDateString("pt-BR")}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-500">
                  {h.position ? `${h.position}º` : "fora do top"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
