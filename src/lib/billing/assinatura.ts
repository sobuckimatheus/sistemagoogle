import "server-only";

import { motivoDoBloqueio, recursosDoStatus } from "@/lib/billing/plano";
import { prisma } from "@/lib/prisma";

/**
 * Assinatura da conta com o plano carregado.
 *
 * Toda conta ganha uma no provisionamento (FREE/TRIALING), então a ausência é
 * anomalia — mas não vale derrubar a tela por isso: quem chama trata o nulo.
 */
export async function assinaturaDaConta(accountId: string) {
  return prisma.subscription.findUnique({
    where: { accountId },
    include: { plan: true },
  });
}

/**
 * Porta única para os caminhos que criam coisa ou gastam cota (E9-05/E9-06).
 *
 * Devolve a mensagem de bloqueio, ou `null` quando pode seguir. Ser uma
 * mensagem e não uma exceção é proposital: as Server Actions do projeto já
 * respondem `{ erro }` para a UI, e um throw viraria tela de erro genérica no
 * lugar de uma explicação sobre a cobrança.
 */
export async function bloqueioDeEscrita(
  accountId: string,
): Promise<string | null> {
  const assinatura = await assinaturaDaConta(accountId);

  if (!assinatura) {
    return "Assinatura não encontrada para esta conta.";
  }

  if (!recursosDoStatus(assinatura.status).escrita) {
    return motivoDoBloqueio(assinatura.status);
  }

  return null;
}
