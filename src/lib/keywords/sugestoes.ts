import "server-only";

import { IaIndisponivelError, sugerirPalavrasChave } from "@/lib/ia";
import { prisma } from "@/lib/prisma";

/**
 * Sugestões de termo prontas quando o painel abre.
 *
 * A geração é feita **uma vez** e guardada. Sem cache, trazer a lista pronta
 * custaria uma chamada à Anthropic a cada visita — e recarregar a página é
 * visita. O conteúdo depende da categoria e da cidade, que quase não mudam;
 * pagar por reescrever a mesma lista a cada abertura seria desperdício puro.
 *
 * O contexto é gravado junto: mudou a categoria ou a cidade no perfil, a
 * sugestão vale para outro negócio e é regerada sozinha.
 */

export const QUANTIDADE_SUGESTOES = 10;

export type Sugestao = {
  termo: string;
  /** Verdadeiro quando o termo já está na lista de acompanhamento. */
  jaAdicionado: boolean;
};

/**
 * Por que a lista veio vazia, quando vier.
 *
 * Existe porque devolver `[]` calado é indistinguível de "não há o que
 * sugerir": quem abre a tela vê o painel como antes e não tem como saber que
 * falta uma chave ou um campo do perfil. Cada motivo pede uma ação diferente.
 */
export type MotivoSemSugestoes =
  | "sem-categoria"
  | "sem-cidade"
  | "ia-indisponivel"
  | "falhou";

export type ResultadoSugestoes = {
  sugestoes: Sugestao[];
  motivo: MotivoSemSugestoes | null;
};

/** Categoria e cidade que valem para esta geração. */
function contextoDe(negocio: {
  primaryCategory: string | null;
  city: string | null;
  state: string | null;
}): string {
  return [negocio.primaryCategory, negocio.city, negocio.state]
    .map((p) => p?.trim().toLowerCase() ?? "")
    .join("|");
}

/**
 * Devolve as sugestões do negócio, gerando só quando não há cache válido.
 *
 * Nunca lança: a lista de sugestões é acessório da tela. Se a IA estiver fora
 * ou sem chave, o painel abre igual e o usuário adiciona termos à mão —
 * derrubar a página inteira por causa de uma sugestão seria trocar o
 * essencial pelo acessório.
 */
export async function sugestoesDoNegocio(negocio: {
  id: string;
  primaryCategory: string | null;
  city: string | null;
  state: string | null;
}): Promise<ResultadoSugestoes> {
  // Sem categoria ou cidade não há o que sugerir: os dois são o insumo do
  // prompt, e chutar renderia termo genérico que não serve para ninguém.
  if (!negocio.primaryCategory) return { sugestoes: [], motivo: "sem-categoria" };
  if (!negocio.city) return { sugestoes: [], motivo: "sem-cidade" };

  const contexto = contextoDe(negocio);

  const [guardadas, existentes] = await Promise.all([
    prisma.keywordSuggestion.findMany({
      where: { businessId: negocio.id, contexto },
      orderBy: { createdAt: "asc" },
      take: QUANTIDADE_SUGESTOES,
    }),
    prisma.keyword.findMany({
      where: { businessId: negocio.id },
      select: { term: true },
    }),
  ]);

  const jaTem = new Set(existentes.map((k) => k.term.trim().toLowerCase()));

  if (guardadas.length > 0) {
    return {
      sugestoes: guardadas.map((s) => ({
        termo: s.term,
        jaAdicionado: jaTem.has(s.term.trim().toLowerCase()),
      })),
      motivo: null,
    };
  }

  let termos: string[];
  try {
    termos = await sugerirPalavrasChave(
      negocio.primaryCategory,
      negocio.city,
      QUANTIDADE_SUGESTOES,
    );
  } catch (erro) {
    // Sem chave é o caso comum em ambiente recém-configurado, e é acionável:
    // a tela diz o que falta em vez de mostrar um painel vazio sem motivo.
    return {
      sugestoes: [],
      motivo: erro instanceof IaIndisponivelError ? "ia-indisponivel" : "falhou",
    };
  }

  if (termos.length === 0) return { sugestoes: [], motivo: "falhou" };

  // O contexto antigo sai junto: guardar as duas gerações encheria a tabela
  // com sugestões de uma cidade que o negócio não tem mais.
  await prisma.keywordSuggestion.deleteMany({ where: { businessId: negocio.id } });
  await prisma.keywordSuggestion.createMany({
    data: termos.map((termo) => ({ businessId: negocio.id, term: termo, contexto })),
    skipDuplicates: true,
  });

  return {
    sugestoes: termos.map((termo) => ({
      termo,
      jaAdicionado: jaTem.has(termo.trim().toLowerCase()),
    })),
    motivo: null,
  };
}
