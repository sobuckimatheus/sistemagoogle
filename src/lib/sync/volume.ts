import "server-only";

import { prisma } from "@/lib/prisma";
import { fonteDeVolume } from "@/lib/volume";
import { localidadeDoNegocio } from "@/lib/volume/localidade";

/**
 * Preenche `Keyword.volume` a partir da fonte configurada.
 *
 * Um lugar só, usado pelos três caminhos: criação do termo, botão de
 * atualizar e job mensal. O volume é caro de buscar e muda devagar — repetir
 * a chamada em cada tela seria gastar operação da API para exibir o mesmo
 * número.
 *
 * **O volume é sempre o da cidade do negócio**, resolvida a partir do perfil
 * vinculado no Google. Por isso os termos são agrupados por negócio antes de
 * consultar: uma chamada carrega uma localidade só, e misturar negócios de
 * cidades diferentes num lote daria a todos o número de uma delas.
 *
 * Negócio sem cidade reconhecida **não é consultado**. Cair para volume
 * nacional seria devolver um número que parece certo e não é — pior do que
 * não devolver nada, porque ninguém desconfia de campo preenchido.
 *
 * Nunca lança: volume é enriquecimento. A palavra-chave funciona sem ele, e
 * derrubar a criação do termo porque o Ads está fora seria trocar uma
 * funcionalidade essencial por uma acessória.
 */

/** Idade a partir da qual o volume é considerado velho. */
export const DIAS_ATE_REVALIDAR = 30;

export type ResultadoVolume = {
  atualizados: number;
  semDado: number;
  fonte?: string;
  erro?: string;
  /** Termos pulados porque a cidade do negócio não foi reconhecida. */
  semCidade?: number;
};

export async function atualizarVolumes(
  keywordIds: string[],
): Promise<ResultadoVolume> {
  if (keywordIds.length === 0) return { atualizados: 0, semDado: 0 };

  const fonte = fonteDeVolume();

  if (!fonte) {
    return {
      atualizados: 0,
      semDado: 0,
      erro:
        "Nenhuma fonte de volume configurada (Google Ads ou Mangools). " +
        "Os termos continuam valendo para o rastreamento de posição.",
    };
  }

  const palavras = await prisma.keyword.findMany({
    where: { id: { in: keywordIds } },
    select: {
      id: true,
      term: true,
      businessId: true,
      business: { select: { city: true, state: true } },
    },
  });

  if (palavras.length === 0) return { atualizados: 0, semDado: 0 };

  // Um lote por negócio: cada chamada carrega a localidade de uma cidade só.
  const porNegocio = new Map<string, typeof palavras>();
  for (const p of palavras) {
    const lista = porNegocio.get(p.businessId) ?? [];
    lista.push(p);
    porNegocio.set(p.businessId, lista);
  }

  const total: Required<Pick<ResultadoVolume, "atualizados" | "semDado" | "semCidade">> =
    { atualizados: 0, semDado: 0, semCidade: 0 };
  let ultimoErro: string | undefined;

  for (const [, doNegocio] of porNegocio) {
    const localidade = localidadeDoNegocio(doNegocio[0].business);

    if (!localidade) {
      total.semCidade += doNegocio.length;
      continue;
    }

    const parcial = await volumesDeUmNegocio(fonte, doNegocio, localidade.codigo);
    total.atualizados += parcial.atualizados;
    total.semDado += parcial.semDado;
    if (parcial.erro) ultimoErro = parcial.erro;
  }

  return {
    ...total,
    fonte: fonte.nome,
    erro:
      ultimoErro ??
      (total.semCidade > 0 && total.atualizados === 0
        ? "Cidade do negócio não reconhecida. O volume é sempre o da cidade, " +
          "então nada foi consultado — confira o endereço no perfil do Google."
        : undefined),
  };
}

/** Busca e grava o volume de um negócio só, já com a localidade resolvida. */
async function volumesDeUmNegocio(
  fonte: NonNullable<ReturnType<typeof fonteDeVolume>>,
  palavras: { id: string; term: string }[],
  localidade: number,
): Promise<{ atualizados: number; semDado: number; erro?: string }> {
  try {
    const volumes = await fonte.buscar(
      palavras.map((p) => p.term),
      localidade,
    );

    // Fonte que responde 200 mas não devolve volume para *nenhum* termo não
    // está dizendo "não há dado" — está fora do ar, sem plano, ou com
    // credencial que autentica e não entrega (o plano gratuito do Mangools se
    // comporta assim). Marcar esses termos como consultados os esconderia do
    // job por 30 dias, mesmo depois da fonte ser corrigida.
    const respondeu = volumes.some((v) => v.volume !== null);

    if (!respondeu && volumes.length > 0) {
      return {
        atualizados: 0,
        semDado: volumes.length,
        erro:
          `${fonte.nome} não devolveu volume para nenhum termo. ` +
          "Verifique se o plano da conta dá acesso aos dados da API.",
      };
    }

    const porTermo = new Map(volumes.map((v) => [v.termo.toLowerCase(), v]));

    let atualizados = 0;
    let semDado = 0;

    for (const palavra of palavras) {
      const encontrado = porTermo.get(palavra.term.toLowerCase());

      // `volumeSyncedAt` avança mesmo para o termo sem volume: a fonte
      // respondeu sobre os outros, então este realmente não tem dado. Sem
      // isso, ele seria reconsultado em toda execução do job, para sempre.
      // O caso "nenhum termo veio com volume" foi tratado acima e não chega
      // aqui.
      await prisma.keyword.update({
        where: { id: palavra.id },
        data: {
          volume: encontrado?.volume ?? null,
          volumeSyncedAt: new Date(),
        },
      });

      if (encontrado?.volume != null) atualizados++;
      else semDado++;
    }

    return { atualizados, semDado };
  } catch (erro) {
    return { atualizados: 0, semDado: 0, erro: (erro as Error).message };
  }
}

/** Termos nunca consultados ou com volume vencido. */
export async function volumesVencidos(limite = 200): Promise<string[]> {
  const corte = new Date(Date.now() - DIAS_ATE_REVALIDAR * 86400000);

  const palavras = await prisma.keyword.findMany({
    where: {
      active: true,
      OR: [{ volumeSyncedAt: null }, { volumeSyncedAt: { lt: corte } }],
      // Só de contas que estão pagando: revalidar volume de conta cancelada
      // gasta operação da API sem ninguém para ler o número.
      business: {
        status: "ACTIVE",
        account: {
          subscription: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        },
      },
    },
    select: { id: true },
    orderBy: { volumeSyncedAt: { sort: "asc", nulls: "first" } },
    take: limite,
  });

  return palavras.map((p) => p.id);
}
