"use server";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";
import {
  rankingLocal,
  SemFonteDeRankingError,
  type ResultadoLocal,
} from "@/lib/ranking";

export type EstadoAnalise =
  | { tipo: "vazio" }
  | { tipo: "erro"; mensagem: string }
  | {
      tipo: "resultado";
      negocio: string;
      placeId: string;
      termo: string;
      posicao: number | null;
      ranking: ResultadoLocal[];
    };

/**
 * Posição de um negócio no Maps para uma palavra-chave.
 *
 * Funciona para qualquer negócio, inclusive de quem ainda não é cliente: usa
 * só dado público, sem OAuth e sem allowlist. É a ferramenta de prospecção da
 * agência.
 *
 * O negócio chega já escolhido no autocomplete, o que muda duas coisas em
 * relação a pedir nome e cidade por extenso:
 *
 * 1. **O casamento é por `placeId`.** Comparar títulos falhava com nome
 *    parecido, acento diferente ou variação que o Maps devolve ("Barbearia do
 *    João" vs "Barbearia do Joao LTDA").
 * 2. **A busca parte das coordenadas do próprio negócio.** Não existe primeira
 *    posição absoluta no Maps: toda posição é relativa ao ponto de onde se
 *    busca. Buscar do endereço do negócio responde à pergunta que o dono faz —
 *    "quem me acha aqui perto?".
 */
export async function analisarPosicao(
  _anterior: EstadoAnalise | null,
  formData: FormData,
): Promise<EstadoAnalise> {
  const { conta } = await exigirContaAtiva();

  const placeId = String(formData.get("placeId") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const termo = String(formData.get("termo") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));

  if (!placeId || !nome) {
    return { tipo: "erro", mensagem: "Selecione um negócio na lista." };
  }
  if (!termo) {
    return { tipo: "erro", mensagem: "Digite o serviço que quer verificar." };
  }

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { tipo: "erro", mensagem: bloqueio };

  // Cada análise queima uma das buscas mensais do SerpApi.
  const cota = await consumirCota(LIMITES.serpapi, conta.id);
  if (!cota.permitido) return { tipo: "erro", mensagem: cota.mensagem };

  try {
    // Sem coordenadas, o SerpApi decide o ponto por conta própria e o
    // resultado deixa de ser comparável entre execuções.
    const temPonto = Number.isFinite(lat) && Number.isFinite(lng);
    const ranking = await rankingLocal(
      termo,
      temPonto ? lat : 0,
      temPonto ? lng : 0,
    );

    const encontrado = ranking.find((r) => r.placeId === placeId);

    // Fallback por título: o place_id do SerpApi e o da Places API vêm da
    // mesma base, mas nem todo resultado do Maps traz o campo preenchido.
    const porTitulo = ranking.find(
      (r) => r.titulo.toLowerCase() === nome.toLowerCase(),
    );

    const posicao = (encontrado ?? porTitulo)?.posicao ?? null;

    await prisma.marketScan.create({
      data: {
        accountId: conta.id,
        queryName: nome,
        businessName: encontrado?.titulo ?? nome,
        placeId,
        keyword: termo,
        position: posicao,
        resultJson: ranking,
      },
    });

    return {
      tipo: "resultado",
      negocio: nome,
      placeId,
      termo,
      posicao,
      ranking,
    };
  } catch (erro) {
    if (erro instanceof SemFonteDeRankingError) {
      return {
        tipo: "erro",
        mensagem:
          "Busca de posição não configurada. Defina as credenciais do DataForSEO " +
          "ou a SERPAPI_KEY nas variáveis de ambiente.",
      };
    }
    return { tipo: "erro", mensagem: (erro as Error).message };
  }
}
