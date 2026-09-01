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
const ENDPOINT_AUTOCOMPLETE =
  "https://places.googleapis.com/v1/places:autocomplete";
const BASE_DETALHES = "https://places.googleapis.com/v1/places";

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


// ── Autocomplete de negócios (Local Rank Checker) ───────────────────────────

export type SugestaoDeNegocio = {
  placeId: string;
  /** Nome do negócio. */
  principal: string;
  /** Endereço ou cidade, para desempatar homônimos. */
  secundario: string | null;
};

/**
 * Sugestões enquanto o usuário digita o nome do negócio.
 *
 * O `sessionToken` não é enfeite: o Google cobra o autocomplete por sessão
 * quando as sugestões e o detalhamento compartilham o mesmo token. Sem ele,
 * **cada tecla digitada vira uma cobrança separada** — o custo de uma busca
 * passa de centavos para alguns dólares em uma tarde de uso.
 */
export async function sugerirNegocios(
  texto: string,
  sessionToken?: string,
): Promise<SugestaoDeNegocio[]> {
  if (!serverEnv.GOOGLE_PLACES_API_KEY) {
    throw new PlacesIndisponivelError("GOOGLE_PLACES_API_KEY não configurada.");
  }

  const resposta = await fetch(ENDPOINT_AUTOCOMPLETE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverEnv.GOOGLE_PLACES_API_KEY,
    },
    body: JSON.stringify({
      input: texto,
      languageCode: "pt-BR",
      regionCode: "BR",
      ...(sessionToken ? { sessionToken } : {}),
    }),
    cache: "no-store",
  });

  if (!resposta.ok) {
    if (resposta.status === 403) {
      throw new PlacesIndisponivelError(
        "A Places API recusou a chave. Verifique o billing e se a chave tem " +
          "permissão para a Places API (New).",
      );
    }
    throw new PlacesIndisponivelError(
      `Places API respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`,
    );
  }

  const dados = (await resposta.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        text?: { text?: string };
      };
    }[];
  };

  return (dados.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId!,
      principal:
        p.structuredFormat?.mainText?.text ?? p.text?.text ?? "sem nome",
      secundario: p.structuredFormat?.secondaryText?.text ?? null,
    }));
}

export type DetalhesDoLugar = {
  placeId: string;
  nome: string;
  endereco: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  categoria: string | null;
  lat: number | null;
  lng: number | null;
  /** Nome do recurso da foto, no formato `places/X/photos/Y`. */
  foto: string | null;
};

/** Campos do detalhamento. Cada um entra na conta — peça só o que a tela usa. */
const CAMPOS_DETALHE = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "primaryTypeDisplayName",
  "location",
  "photos",
].join(",");

/**
 * Detalhes do negócio escolhido no autocomplete.
 *
 * Recebe o mesmo `sessionToken` das sugestões: é o que fecha a sessão de
 * autocomplete e faz o Google cobrar o conjunto como um evento só.
 */
export async function detalhesDoLugar(
  placeId: string,
  sessionToken?: string,
): Promise<DetalhesDoLugar> {
  if (!serverEnv.GOOGLE_PLACES_API_KEY) {
    throw new PlacesIndisponivelError("GOOGLE_PLACES_API_KEY não configurada.");
  }

  const url = new URL(`${BASE_DETALHES}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "pt-BR");
  url.searchParams.set("regionCode", "BR");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const resposta = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": serverEnv.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": CAMPOS_DETALHE,
    },
    cache: "no-store",
  });

  if (!resposta.ok) {
    throw new PlacesIndisponivelError(
      `Places API respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`,
    );
  }

  const p = (await resposta.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    primaryTypeDisplayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    photos?: { name?: string }[];
  };

  return {
    placeId: p.id ?? placeId,
    nome: p.displayName?.text ?? "sem nome",
    endereco: p.formattedAddress ?? null,
    nota: p.rating ?? null,
    totalAvaliacoes: p.userRatingCount ?? null,
    categoria: p.primaryTypeDisplayName?.text ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    foto: p.photos?.[0]?.name ?? null,
  };
}

/**
 * Bytes da foto do perfil.
 *
 * Fica no servidor porque a chave da Places API não pode ir para o navegador —
 * ela é cobrada por uso e ficaria exposta em qualquer `img src`.
 */
export async function fotoDoLugar(
  nomeDaFoto: string,
  larguraMax = 400,
): Promise<Response> {
  if (!serverEnv.GOOGLE_PLACES_API_KEY) {
    throw new PlacesIndisponivelError("GOOGLE_PLACES_API_KEY não configurada.");
  }

  const url = new URL(`https://places.googleapis.com/v1/${nomeDaFoto}/media`);
  url.searchParams.set("maxWidthPx", String(larguraMax));
  url.searchParams.set("key", serverEnv.GOOGLE_PLACES_API_KEY);

  return fetch(url, { redirect: "follow" });
}
