"use server";

import { headers } from "next/headers";

import { contaAtivaOuNulo } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";
import { consumirCota, ipDaRequisicao, LIMITES } from "@/lib/rate-limit";
import { SemFonteDeRankingError, type ResultadoLocal } from "@/lib/ranking";
import { medirAlcance, type Anel } from "@/lib/ranking/alcance";

export type EstadoVerificacao =
  | { tipo: "erro"; mensagem: string }
  | {
      tipo: "resultado";
      negocio: string;
      placeId: string;
      termo: string;
      /** Posição medida do endereço do próprio negócio. */
      naPorta: number | null;
      /** Até onde ainda é encontrado, em km. */
      alcanceKm: number | null;
      aneis: Anel[];
      ranking: ResultadoLocal[];
      kmDoRanking: number;
    };

/**
 * Verificação de posição aberta ao público — a isca do produto.
 *
 * Roda sem login de propósito: a pergunta "em que posição eu apareço?" é o
 * que traz a pessoa, e exigir cadastro antes de responder mata a conversão.
 *
 * O custo disso é real, e por isso há três travas. O plano grátis do SerpApi
 * dá 100 buscas por **mês**: sem teto, um robô esvazia a cota do produto
 * inteiro em minutos e derruba junto as telas pagas, que é onde está a
 * receita.
 */
export async function verificarPosicao(
  _anterior: EstadoVerificacao | null,
  formData: FormData,
): Promise<EstadoVerificacao> {
  const placeId = String(formData.get("placeId") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const termo = String(formData.get("termo") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));

  if (!placeId || !nome) {
    return { tipo: "erro", mensagem: "Escolha sua empresa na lista." };
  }
  if (!termo) {
    return {
      tipo: "erro",
      mensagem: "Digite o serviço que seus clientes procuram.",
    };
  }

  const sessaoAtiva = await contaAtivaOuNulo();
  const cabecalhos = await headers();

  // Assinante não passa pelo teto do visitante: ele já paga pela cota.
  if (!sessaoAtiva) {
    const global = await consumirCota(LIMITES.buscaAnonimaGlobal, "global");
    if (!global.permitido) {
      return {
        tipo: "erro",
        mensagem:
          "O limite de verificações gratuitas de hoje foi atingido. " +
          "Crie uma conta para verificar sem espera.",
      };
    }

    const porIp = await consumirCota(
      LIMITES.buscaAnonima,
      ipDaRequisicao({ headers: cabecalhos }),
    );
    if (!porIp.permitido) {
      return {
        tipo: "erro",
        mensagem:
          "Você já fez algumas verificações gratuitas. " +
          "Crie uma conta para continuar acompanhando sua posição.",
      };
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      tipo: "erro",
      mensagem: "Não consegui localizar o endereço dessa empresa no mapa.",
    };
  }

  try {
    const medicao = await medirAlcance(termo, lat, lng, placeId, nome);
    const posicao = medicao.naPorta;

    // Guarda o histórico de quem está logado; visitante anônimo não tem onde
    // pendurar o registro, e criar conta fantasma para isso seria pior.
    if (sessaoAtiva) {
      await prisma.marketScan.create({
        data: {
          accountId: sessaoAtiva.conta.id,
          queryName: nome,
          businessName: nome,
          placeId,
          keyword: termo,
          position: posicao,
          resultJson: {
            alcanceKm: medicao.alcanceKm,
            naPorta: medicao.naPorta,
            aneis: medicao.aneis,
            ranking: medicao.ranking,
          },
        },
      });
    }

    return {
      tipo: "resultado",
      negocio: nome,
      placeId,
      termo,
      naPorta: medicao.naPorta,
      alcanceKm: medicao.alcanceKm,
      aneis: medicao.aneis,
      ranking: medicao.ranking,
      kmDoRanking: medicao.kmDoRanking,
    };
  } catch (erro) {
    if (erro instanceof SemFonteDeRankingError) {
      return {
        tipo: "erro",
        mensagem:
          "A verificação de posição está temporariamente indisponível. Tente de novo em alguns minutos.",
      };
    }
    return { tipo: "erro", mensagem: (erro as Error).message };
  }
}
