import "server-only";

import {
  dataForSeoConfigurado,
  rankingPeloDataForSeo,
} from "@/lib/dataforseo/maps";
import { rankingNoMaps as rankingPeloSerpApi } from "@/lib/serpapi";
import type { ResultadoLocal } from "@/lib/ranking/tipos";

/**
 * Fonte da posição no Maps.
 *
 * DataForSEO primeiro: custa US$ 0,002 por busca, traz a foto de cada
 * resultado e devolve `place_id` compatível com o autocomplete. O SerpApi
 * segue como reserva — funciona, mas o plano gratuito dá 100 buscas por mês,
 * o que não sustenta uma página pública.
 *
 * Nenhuma fonte configurada é erro de configuração, não de uso: quem chama
 * traduz isso em uma mensagem de tela.
 */
export class SemFonteDeRankingError extends Error {
  constructor() {
    super(
      "Nenhuma fonte de posição configurada (DataForSEO ou SERPAPI_KEY).",
    );
    this.name = "SemFonteDeRankingError";
  }
}

export function fonteDeRanking(): string | null {
  if (dataForSeoConfigurado()) return "DataForSEO";
  if (process.env.SERPAPI_KEY) return "SerpApi";
  return null;
}

export async function rankingLocal(
  termo: string,
  lat: number,
  lng: number,
): Promise<ResultadoLocal[]> {
  if (dataForSeoConfigurado()) {
    return rankingPeloDataForSeo(termo, lat, lng);
  }

  if (process.env.SERPAPI_KEY) {
    return rankingPeloSerpApi(termo, lat, lng);
  }

  throw new SemFonteDeRankingError();
}

export type { ResultadoLocal } from "@/lib/ranking/tipos";
