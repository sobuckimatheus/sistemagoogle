import "server-only";

import { serverEnv } from "@/lib/env/server";

/**
 * Places API (New) — dados públicos de concorrentes.
 *
 * Não usa OAuth: é chave de API, e por isso funciona independente do
 * allowlist das Business Profile APIs. Exige billing ativo no Google Cloud
 * mesmo dentro da cota gratuita.
 *
 * ⚠️ Regra de produto (PRD 5.6): **não reordenar o resultado**. A ordem que
 * o Google devolve é a de relevância da busca, e é justamente ela que
 * interessa ao cliente — reordenar por nota ou por um score nosso inventaria
 * um ranking que não existe.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

/** A Places API cobra pelo que você pede: o field mask controla o custo. */
const CAMPOS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.primaryTypeDisplayName",
  "places.location",
].join(",");

export class PlacesIndisponivelError extends Error {
  constructor(readonly detalhe: string) {
    super(detalhe);
    this.name = "PlacesIndisponivelError";
  }
}

export type Concorrente = {
  placeId: string;
  nome: string;
  endereco: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  site: string | null;
  temHorarios: boolean;
  categoria: string | null;
  lat: number | null;
  lng: number | null;
};

export async function buscarConcorrentes(
  consulta: string,
  centro?: { lat: number; lng: number },
): Promise<Concorrente[]> {
  if (!serverEnv.GOOGLE_PLACES_API_KEY) {
    throw new PlacesIndisponivelError(
      "GOOGLE_PLACES_API_KEY não configurada.",
    );
  }

  const corpo: Record<string, unknown> = {
    textQuery: consulta,
    languageCode: "pt-BR",
    regionCode: "BR",
    maxResultCount: 20,
  };

  // Enviesa a busca para a região do negócio; sem isso o Google pode devolver
  // resultados de outra cidade com o mesmo termo.
  if (centro) {
    corpo.locationBias = {
      circle: {
        center: { latitude: centro.lat, longitude: centro.lng },
        radius: 10000,
      },
    };
  }

  const resposta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverEnv.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": CAMPOS,
    },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    // 403 aqui quase sempre é billing desativado ou chave restrita a outra
    // API — vale dizer isso em vez de repassar o erro cru.
    if (resposta.status === 403) {
      throw new PlacesIndisponivelError(
        "A Places API recusou a chave. Verifique se o billing está ativo no " +
          "Google Cloud e se a chave tem permissão para a Places API (New).",
      );
    }
    throw new PlacesIndisponivelError(
      `Places API respondeu ${resposta.status}: ${texto}`,
    );
  }

  const dados = (await resposta.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      websiteUri?: string;
      regularOpeningHours?: unknown;
      primaryTypeDisplayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
    }[];
  };

  // Sem .sort() de propósito — ver a nota no topo do arquivo.
  return (dados.places ?? []).map((p) => ({
    placeId: p.id,
    nome: p.displayName?.text ?? "sem nome",
    endereco: p.formattedAddress ?? null,
    nota: p.rating ?? null,
    totalAvaliacoes: p.userRatingCount ?? null,
    site: p.websiteUri ?? null,
    temHorarios: Boolean(p.regularOpeningHours),
    categoria: p.primaryTypeDisplayName?.text ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
  }));
}
