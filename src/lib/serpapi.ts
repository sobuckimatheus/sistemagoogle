import "server-only";

import { serverEnv } from "@/lib/env/server";

/**
 * SerpApi — posição real no Google Maps por palavra-chave e localização.
 *
 * Usa dado público: não exige OAuth nem allowlist, o que torna esta a única
 * parte do produto que funciona antes da aprovação do Google. É também a base
 * da Análise de Mercado, que analisa qualquer negócio — inclusive um que
 * ainda não é cliente.
 *
 * ⚠️ Cota: o plano grátis dá 100 buscas por mês, e cada ponto consultado
 * consome uma. Uma grade 5x5 gasta 25 de uma vez.
 */

const BASE = "https://serpapi.com/search.json";

export class SerpApiIndisponivelError extends Error {
  constructor() {
    super("SERPAPI_KEY não configurada.");
    this.name = "SerpApiIndisponivelError";
  }
}

export type ResultadoLocal = {
  posicao: number;
  titulo: string;
  placeId: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  endereco: string | null;
  tipo: string | null;
};

/**
 * Busca o ranking do Maps para um termo, a partir de um ponto geográfico.
 *
 * `lat`/`lng` importam mais do que parecem: não existe "primeiro lugar"
 * absoluto no Maps. Toda posição é relativa a quem busca e de onde busca —
 * fato que a interface precisa comunicar para não criar expectativa errada.
 */
export async function rankingNoMaps(
  termo: string,
  lat: number,
  lng: number,
  zoom = 14,
): Promise<ResultadoLocal[]> {
  if (!serverEnv.SERPAPI_KEY) throw new SerpApiIndisponivelError();

  const url = new URL(BASE);
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", termo);
  url.searchParams.set("ll", `@${lat},${lng},${zoom}z`);
  url.searchParams.set("type", "search");
  url.searchParams.set("hl", "pt-br");
  url.searchParams.set("gl", "br");
  url.searchParams.set("api_key", serverEnv.SERPAPI_KEY);

  const resposta = await fetch(url, { cache: "no-store" });

  if (!resposta.ok) {
    throw new Error(
      `SerpApi respondeu ${resposta.status}: ${await resposta.text()}`,
    );
  }

  const dados = (await resposta.json()) as {
    error?: string;
    local_results?: {
      position?: number;
      title: string;
      place_id?: string;
      rating?: number;
      reviews?: number;
      address?: string;
      type?: string;
    }[];
  };

  if (dados.error) throw new Error(`SerpApi: ${dados.error}`);

  return (dados.local_results ?? []).map((r, i) => ({
    posicao: r.position ?? i + 1,
    titulo: r.title,
    placeId: r.place_id ?? null,
    nota: r.rating ?? null,
    totalAvaliacoes: r.reviews ?? null,
    endereco: r.address ?? null,
    tipo: r.type ?? null,
  }));
}

/** Localiza um negócio pelo nome, para a Análise de Mercado. */
export async function buscarNegocio(
  nome: string,
  cidade: string,
): Promise<ResultadoLocal[]> {
  if (!serverEnv.SERPAPI_KEY) throw new SerpApiIndisponivelError();

  const url = new URL(BASE);
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", `${nome} ${cidade}`);
  url.searchParams.set("type", "search");
  url.searchParams.set("hl", "pt-br");
  url.searchParams.set("gl", "br");
  url.searchParams.set("api_key", serverEnv.SERPAPI_KEY);

  const resposta = await fetch(url, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(
      `SerpApi respondeu ${resposta.status}: ${await resposta.text()}`,
    );
  }

  const dados = (await resposta.json()) as {
    error?: string;
    local_results?: {
      position?: number;
      title: string;
      place_id?: string;
      rating?: number;
      reviews?: number;
      address?: string;
      type?: string;
      gps_coordinates?: { latitude: number; longitude: number };
    }[];
    place_results?: {
      title: string;
      place_id?: string;
      rating?: number;
      reviews?: number;
      address?: string;
      type?: string;
    };
  };

  if (dados.error) throw new Error(`SerpApi: ${dados.error}`);

  // Busca por nome específico pode cair direto na ficha do lugar em vez da
  // lista — normalizamos para o mesmo formato.
  if (dados.place_results && !dados.local_results?.length) {
    const p = dados.place_results;
    return [
      {
        posicao: 1,
        titulo: p.title,
        placeId: p.place_id ?? null,
        nota: p.rating ?? null,
        totalAvaliacoes: p.reviews ?? null,
        endereco: p.address ?? null,
        tipo: p.type ?? null,
      },
    ];
  }

  return (dados.local_results ?? []).slice(0, 10).map((r, i) => ({
    posicao: r.position ?? i + 1,
    titulo: r.title,
    placeId: r.place_id ?? null,
    nota: r.rating ?? null,
    totalAvaliacoes: r.reviews ?? null,
    endereco: r.address ?? null,
    tipo: r.type ?? null,
  }));
}
