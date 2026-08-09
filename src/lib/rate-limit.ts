import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Rate limiting das chamadas a API paga (E10-05).
 *
 * O que se protege aqui não é o servidor — é a fatura. Um botão de "analisar
 * mercado" clicado em loop queima as 100 buscas mensais do SerpApi em dois
 * minutos, e a cota é da instalação inteira, não do usuário que clicou.
 *
 * O contador vive no banco porque cada invocação serverless tem a própria
 * memória: um limite em memória seria multiplicado pelo número de instâncias
 * quentes, que é justamente o que ninguém controla.
 *
 * A janela é deslizante — conta as chamadas dos últimos N minutos, em vez de
 * zerar em horário fixo. Janela fixa permite gastar o dobro do limite na
 * virada, que é onde um loop chega primeiro.
 */

export type Limite = {
  /** Identificador do recurso, compõe a chave junto com a conta. */
  recurso: string;
  /** Chamadas permitidas na janela. */
  maximo: number;
  /** Tamanho da janela, em minutos. */
  janelaMinutos: number;
};

/** Limites por recurso, no lugar onde dá para revisar todos de uma vez. */
export const LIMITES = {
  /** SerpApi: 100 buscas/mês no plano grátis. 10/hora por conta já é folgado. */
  serpapi: { recurso: "serpapi", maximo: 10, janelaMinutos: 60 },
  /** Places API é cobrada por consulta. */
  places: { recurso: "places", maximo: 30, janelaMinutos: 60 },
  /** Anthropic: custo por geração, e o usuário revisa cada texto de todo jeito. */
  ia: { recurso: "ia", maximo: 40, janelaMinutos: 60 },
  /**
   * Volume de busca, qualquer que seja a fonte. O botão de "atualizar
   * volumes" é fácil de martelar sem que o número mude — o dado é uma média
   * mensal —, e no Mangools cada consulta consome lookup do plano.
   */
  volume: { recurso: "volume", maximo: 12, janelaMinutos: 60 },
} as const satisfies Record<string, Limite>;

export type ResultadoCota =
  | { permitido: true; restantes: number }
  | { permitido: false; mensagem: string };

/**
 * Consome uma unidade da cota, se houver.
 *
 * Grava primeiro e conta depois: contar antes de gravar deixaria duas
 * requisições simultâneas passarem pela mesma vaga. Quando o registro estoura
 * o limite, ele é removido — assim uma tentativa recusada não conta contra a
 * janela seguinte, que puniria o usuário duas vezes pelo mesmo clique.
 */
export async function consumirCota(
  limite: Limite,
  accountId: string,
): Promise<ResultadoCota> {
  const chave = `${limite.recurso}:${accountId}`;
  const inicioDaJanela = new Date(Date.now() - limite.janelaMinutos * 60_000);

  const registro = await prisma.rateLimitHit.create({ data: { chave } });

  const usadas = await prisma.rateLimitHit.count({
    where: { chave, createdAt: { gte: inicioDaJanela } },
  });

  if (usadas > limite.maximo) {
    await prisma.rateLimitHit
      .delete({ where: { id: registro.id } })
      .catch(() => undefined);

    return {
      permitido: false,
      mensagem:
        `Limite de ${limite.maximo} usos por ` +
        `${limite.janelaMinutos} minutos atingido para este recurso. ` +
        `Ele existe para proteger a cota da sua conta nas APIs externas — ` +
        `tente de novo mais tarde.`,
    };
  }

  // Limpeza oportunista: mantém a tabela do tamanho da janela sem job próprio.
  // Só dispara de vez em quando porque um DELETE por requisição seria pior do
  // que as linhas que ele apaga.
  if (Math.random() < 0.05) {
    await prisma.rateLimitHit
      .deleteMany({ where: { chave, createdAt: { lt: inicioDaJanela } } })
      .catch(() => undefined);
  }

  return { permitido: true, restantes: limite.maximo - usadas };
}
