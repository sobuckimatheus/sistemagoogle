import "server-only";

import { serverEnv } from "@/lib/env/server";
import { fetchComRetry } from "@/lib/http";

/**
 * Volume de busca pelo Keyword Planner da API do Google Ads.
 *
 * Substitui o DataForSEO como fonte de `Keyword.volume`. A troca vale por dois
 * motivos:
 *
 * 1. **É a fonte primária.** Todo provedor terceirizado de volume revende, com
 *    atraso e modelagem própria, o número que sai daqui.
 * 2. **A precisão depende do investimento da conta.** O Keyword Planner
 *    devolve faixas largas ("1 mil – 10 mil") para contas sem gasto relevante
 *    e a média mensal fechada para contas com investimento ativo. Em uma conta
 *    que já gasta, o número vem utilizável.
 *
 * O que ele **não** faz: posição em SERP. Rastreamento de posição e a Análise
 * de Mercado continuam no SerpApi — são dados diferentes, não fontes
 * concorrentes.
 */

/**
 * Versão da API.
 *
 * O Google Ads aposenta cada versão em cerca de um ano. Depois disso a
 * chamada responde 404 com uma **página HTML**, não com erro JSON da API — o
 * que confunde, porque não se parece com nada documentado. Confira a versão
 * corrente antes de culpar credencial: é o motivo mais comum de uma
 * integração que funcionava parar do nada.
 *
 * Aposentadas até aqui: v21 (agosto de 2026).
 */
const VERSAO = "v25";

/** Brasil. Lista completa em geo target constants da documentação. */
const GEO_BRASIL = "geoTargetConstants/2076";
/** Português. */
const IDIOMA_PT = "languageConstants/1014";

/** Teto por requisição, para não montar payload gigante em conta grande. */
const TERMOS_POR_CHAMADA = 20;

export class GoogleAdsNaoConfiguradoError extends Error {
  constructor() {
    super(
      "Google Ads não configurado (GOOGLE_ADS_DEVELOPER_TOKEN, " +
        "GOOGLE_ADS_CUSTOMER_ID e GOOGLE_ADS_REFRESH_TOKEN).",
    );
    this.name = "GoogleAdsNaoConfiguradoError";
  }
}

export class GoogleAdsRecusouError extends Error {
  constructor(
    public readonly status: number,
    public readonly detalhe: string,
  ) {
    super(`Google Ads respondeu ${status}: ${detalhe}`);
    this.name = "GoogleAdsRecusouError";
  }
}

export function googleAdsConfigurado(): boolean {
  return Boolean(
    serverEnv.GOOGLE_ADS_DEVELOPER_TOKEN &&
      serverEnv.GOOGLE_ADS_CUSTOMER_ID &&
      serverEnv.GOOGLE_ADS_REFRESH_TOKEN &&
      serverEnv.GOOGLE_CLIENT_ID &&
      serverEnv.GOOGLE_CLIENT_SECRET,
  );
}

/** Só dígitos: a API recusa o id com hífen, do jeito que ele aparece na UI. */
function somenteDigitos(id: string): string {
  return id.replace(/\D/g, "");
}

/**
 * Access token a partir do refresh token da conta de Ads.
 *
 * Refresh token próprio, separado do OAuth do Business Profile: o escopo é
 * outro (`adwords`), a conta que autoriza é a da agência — não a do cliente —
 * e amarrar os dois faria a revogação de um derrubar o outro.
 */
async function accessToken(): Promise<string> {
  if (!googleAdsConfigurado()) throw new GoogleAdsNaoConfiguradoError();

  const resposta = await fetchComRetry(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: serverEnv.GOOGLE_CLIENT_ID!,
        client_secret: serverEnv.GOOGLE_CLIENT_SECRET!,
        refresh_token: serverEnv.GOOGLE_ADS_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    },
    { api: "Google OAuth" },
  );

  if (!resposta.ok) {
    throw new GoogleAdsRecusouError(
      resposta.status,
      `falha ao renovar o token: ${(await resposta.text()).slice(0, 300)}`,
    );
  }

  const dados = (await resposta.json()) as { access_token?: string };
  if (!dados.access_token) {
    throw new GoogleAdsRecusouError(200, "resposta sem access_token");
  }

  return dados.access_token;
}

export type VolumeDeTermo = {
  termo: string;
  /** Média de buscas por mês. Nulo quando o Google não tem dado para o termo. */
  volume: number | null;
  /** 0–100. Concorrência entre anunciantes, não dificuldade de SEO. */
  concorrencia: number | null;
};

type RespostaIdeias = {
  results?: {
    text?: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: string | number;
      competitionIndex?: string | number;
    };
  }[];
};

/**
 * Busca o volume dos termos informados.
 *
 * Devolve uma entrada por termo pedido, na ordem original, mesmo quando o
 * Google não tem dado — quem chama precisa distinguir "não perguntamos" de
 * "perguntamos e não há dado", senão o volume nulo vira retentativa eterna.
 *
 * O `keywordSeed` pede exatamente estes termos; as ideias relacionadas que a
 * API costuma devolver são descartadas por não terem sido escolhidas por
 * ninguém.
 */
export async function volumeDeBusca(
  termos: string[],
  opcoes: { geoTarget?: string; idioma?: string } = {},
): Promise<VolumeDeTermo[]> {
  if (termos.length === 0) return [];
  if (!googleAdsConfigurado()) throw new GoogleAdsNaoConfiguradoError();

  const token = await accessToken();
  const customerId = somenteDigitos(serverEnv.GOOGLE_ADS_CUSTOMER_ID!);

  const cabecalhos: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": serverEnv.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "content-type": "application/json",
  };

  // Presente quando a conta é gerenciada por uma MCC: identifica quem está
  // autorizando a chamada, não sobre qual conta ela é feita.
  if (serverEnv.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    cabecalhos["login-customer-id"] = somenteDigitos(
      serverEnv.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    );
  }

  const resultado: VolumeDeTermo[] = [];

  for (let i = 0; i < termos.length; i += TERMOS_POR_CHAMADA) {
    const lote = termos.slice(i, i + TERMOS_POR_CHAMADA);

    const resposta = await fetchComRetry(
      `https://googleads.googleapis.com/${VERSAO}/customers/${customerId}:generateKeywordIdeas`,
      {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          keywordSeed: { keywords: lote },
          geoTargetConstants: [opcoes.geoTarget ?? GEO_BRASIL],
          language: opcoes.idioma ?? IDIOMA_PT,
          keywordPlanNetwork: "GOOGLE_SEARCH",
          includeAdultKeywords: false,
        }),
      },
      { api: "Google Ads" },
    );

    if (!resposta.ok) {
      throw new GoogleAdsRecusouError(
        resposta.status,
        (await resposta.text()).slice(0, 500),
      );
    }

    const dados = (await resposta.json()) as RespostaIdeias;

    // A resposta não preserva a ordem nem se limita aos termos pedidos.
    const porTermo = new Map<string, VolumeDeTermo>();
    for (const item of dados.results ?? []) {
      if (!item.text) continue;
      porTermo.set(item.text.toLowerCase(), {
        termo: item.text,
        volume: numero(item.keywordIdeaMetrics?.avgMonthlySearches),
        concorrencia: numero(item.keywordIdeaMetrics?.competitionIndex),
      });
    }

    for (const termo of lote) {
      resultado.push(
        porTermo.get(termo.toLowerCase()) ?? {
          termo,
          volume: null,
          concorrencia: null,
        },
      );
    }
  }

  return resultado;
}

/**
 * A API devolve inteiros de 64 bits como string no JSON.
 *
 * `Number(undefined)` é `NaN` e `Number(null)` é `0` — este último é o
 * perigoso: gravaria "0 buscas/mês" para um termo que simplesmente não tem
 * dado, e zero é uma afirmação, não uma ausência.
 */
function numero(valor: string | number | undefined): number | null {
  if (valor === undefined || valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}
