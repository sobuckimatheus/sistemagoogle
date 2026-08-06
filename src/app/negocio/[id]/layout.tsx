import Link from "next/link";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

/**
 * Navegação comum aos módulos do negócio.
 *
 * Fica no layout para carregar uma vez só ao trocar de aba — e para
 * centralizar a checagem de que o negócio pertence à conta.
 */
export default async function NegocioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  await exigirNegocioDaConta(id, conta.id);

  const naoLidos = await prisma.alert.count({
    where: { businessId: id, readAt: null },
  });

  const abas = [
    { href: `/negocio/${id}`, rotulo: "Dashboard" },
    { href: `/negocio/${id}/desempenho`, rotulo: "Desempenho" },
    { href: `/negocio/${id}/avaliacoes`, rotulo: "Avaliações" },
    { href: `/negocio/${id}/checklist`, rotulo: "Plano de ação" },
    {
      href: `/negocio/${id}/alertas`,
      rotulo: naoLidos > 0 ? `Alertas (${naoLidos})` : "Alertas",
    },
  ];

  return (
    <div className="flex flex-col">
      <nav className="border-b border-neutral-200 dark:border-neutral-800">
        <ul className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-6 py-2 text-sm">
          {abas.map((aba) => (
            <li key={aba.href}>
              <Link
                href={aba.href}
                className="block whitespace-nowrap rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
              >
                {aba.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
