"use server";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";
import {
  buscarNegocio,
  rankingNoMaps,
  SerpApiIndisponivelError,
  type ResultadoLocal,
} from "@/lib/serpapi";

export type EstadoAnalise =
  | { tipo: "vazio" }
  | { tipo: "erro"; mensagem: string }
  | {
      tipo: "resultado";
      negocio: string;
      termo: string;
      posicao: number | null;
      ranking: ResultadoLocal[];
    };

/**
 * Analisa a posição de qualquer negócio para um termo — inclusive de quem
 * ainda não é cliente. É a ferramenta de prospecção da agência.
 *
 * Usa só dado público do Maps: nenhum OAuth, nenhum allowlist.
 */
export async function analisarMercado(
  _anterior: EstadoAnalise | null,
  formData: FormData,
): Promise<EstadoAnalise> {
  const { conta } = await exigirContaAtiva();

  const nome = String(formData.get("nome") ?? "").trim();
  const cidade = String(formData.get("cidade") ?? "").trim();
  const termo = String(formData.get("termo") ?? "").trim();

  if (!nome || !cidade || !termo) {
    return { tipo: "erro", mensagem: "Preencha negócio, cidade e palavra-chave." };
  }

  try {
    const encontrados = await buscarNegocio(nome, cidade);
    if (encontrados.length === 0) {
      return {
        tipo: "erro",
        mensagem: `Nenhum negócio encontrado para "${nome}" em ${cidade}.`,
      };
    }

    const alvo = encontrados[0];

    // Buscar o termo pela cidade dá o ranking que um cliente da região veria.
    const ranking = await rankingNoMaps(`${termo} ${cidade}`, 0, 0);

    // Casa por place_id quando existe; título é fallback porque o Maps às
    // vezes devolve variações do nome.
    const indice = ranking.findIndex((r) =>
      alvo.placeId && r.placeId
        ? r.placeId === alvo.placeId
        : r.titulo.toLowerCase() === alvo.titulo.toLowerCase(),
    );
    const posicao = indice >= 0 ? ranking[indice].posicao : null;

    await prisma.marketScan.create({
      data: {
        accountId: conta.id,
        queryName: nome,
        businessName: alvo.titulo,
        placeId: alvo.placeId,
        keyword: termo,
        position: posicao,
        resultJson: ranking,
      },
    });

    return {
      tipo: "resultado",
      negocio: alvo.titulo,
      termo,
      posicao,
      ranking,
    };
  } catch (erro) {
    if (erro instanceof SerpApiIndisponivelError) {
      return {
        tipo: "erro",
        mensagem:
          "SerpApi não configurada. Defina SERPAPI_KEY nas variáveis de ambiente.",
      };
    }
    return { tipo: "erro", mensagem: (erro as Error).message };
  }
}
