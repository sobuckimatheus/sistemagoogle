import "server-only";

import { serverEnv } from "@/lib/env/server";
import { fetchComRetry } from "@/lib/http";
import type { ResultadoLocal } from "@/lib/ranking/tipos";

/**
 * Ranking do Google Maps pela API de SERP do DataForSEO.
 *
 * Substitui o SerpApi como fonte de posição, por três motivos medidos:
 *
 * 1. **Custo.** US$ 0,002 por busca contra 100 buscas por *mês* no plano
 *    gratuito do SerpApi. É a diferença entre poder abrir a página isca ao
 *    público e não poder.
 * 2. **Traz a foto.** Cada resultado vem com `main_image`, uma URL direta do
 *    Google que o navegador carrega sem chave — resolvendo, de graça, o que a
 *    Places API não entrega neste projeto.
 * 3. **`place_id` compatível.** É o mesmo identificador que o autocomplete da
 *    Places API devolve, então o casamento do negócio é exato.
 *
 * O que **não** muda: a posição continua sendo relativa ao ponto de onde se
 * busca. É por isso que a coordenada é obrigatória aqui.
 */

const ENDPOINT =
  "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";

/** Código de tarefa para "o Google não devolveu resultado para isto". */
const SEM_RESULTADOS = 40102;

export class DataForSeoIndisponivelError extends Error {
  constructor(detalhe: string) {
    super(detalhe);
    this.name = "DataForSeoIndisponivelError";
  }
}

export function dataForSeoConfigurado(): boolean {
  return Boolean(
    serverEnv.DATAFORSEO_AUTH ||
      (serverEnv.DATAFORSEO_LOGIN && serverEnv.DATAFORSEO_PASSWORD),
  );
}

/** Mesmo cabeçalho do provedor de volume: painel mostra as duas formas. */
export function autorizacaoDataForSeo(): string {
  if (serverEnv.DATAFORSEO_AUTH) {
    const valor = serverEnv.DATAFORSEO_AUTH.trim();
    return valor.toLowerCase().startsWith("basic ") ? valor : `Basic ${valor}`;
  }
  const par = `${serverEnv.DATAFORSEO_LOGIN}:${serverEnv.DATAFORSEO_PASSWORD}`;
  return `Basic ${Buffer.from(par).toString("base64")}`;
}

type ItemDoMaps = {
  rank_absolute?: number;
  title?: string;
  place_id?: string;
  rating?: { value?: number; votes_count?: number };
  address?: string;
  category?: string;
  main_image?: string;
};

/**
 * Busca o ranking para um termo a partir de um ponto.
 *
 * `profundidade` é quantos resultados pedir. Vinte cobre a leitura que
 * interessa — abaixo do vigésimo ninguém é encontrado — e o custo não varia
 * com isso.
 */
export async function rankingPeloDataForSeo(
  termo: string,
  lat: number,
  lng: number,
  profundidade = 20,
): Promise<ResultadoLocal[]> {
  if (!dataForSeoConfigurado()) {
    throw new DataForSeoIndisponivelError("DataForSEO não configurado.");
  }

  const resposta = await fetchComRetry(
    ENDPOINT,
    {
      method: "POST",
      headers: {
        authorization: autorizacaoDataForSeo(),
        "content-type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: termo,
          // O zoom faz parte do ponto: 14z é a vizinhança que um cliente
          // percorreria, nem a rua nem a cidade inteira.
          location_coordinate: `${lat},${lng},14z`,
          language_code: "pt",
          device: "desktop",
          depth: profundidade,
        },
      ]),
    },
    { api: "DataForSEO Maps" },
  );

  const texto = await resposta.text();

  if (!resposta.ok) {
    throw new DataForSeoIndisponivelError(
      `DataForSEO respondeu ${resposta.status}: ${texto.slice(0, 200)}`,
    );
  }

  const dados = JSON.parse(texto) as {
    status_code?: number;
    status_message?: string;
    tasks?: {
      status_code?: number;
      status_message?: string;
      result?: { items?: ItemDoMaps[] }[];
    }[];
  };

  // Responde 200 mesmo recusando; o veredito está no corpo.
  if (dados.status_code !== 20000) {
    throw new DataForSeoIndisponivelError(
      `DataForSEO recusou (${dados.status_code}): ${dados.status_message ?? "sem mensagem"}`,
    );
  }

  const tarefa = dados.tasks?.[0];

  // 40102 é "No Search Results": o Google simplesmente não devolveu nada
  // para aquele termo naquele ponto. É um fato sobre o mercado, não uma
  // falha da integração — e tratar como erro derrubaria a medição inteira
  // por causa de um único ponto vazio no anel mais distante.
  if (tarefa?.status_code === SEM_RESULTADOS) return [];

  if (tarefa && tarefa.status_code !== 20000) {
    throw new DataForSeoIndisponivelError(
      `DataForSEO recusou a tarefa (${tarefa.status_code}): ${tarefa.status_message ?? "sem mensagem"}`,
    );
  }

  const itens = tarefa?.result?.[0]?.items ?? [];

  return itens
    .filter((i) => i.title)
    .map((i, indice) => ({
      posicao: i.rank_absolute ?? indice + 1,
      titulo: i.title!,
      placeId: i.place_id ?? null,
      nota: i.rating?.value ?? null,
      totalAvaliacoes: i.rating?.votes_count ?? null,
      endereco: i.address ?? null,
      tipo: i.category ?? null,
      foto: i.main_image ?? null,
    }));
}

/**
 * Foto de um negócio específico.
 *
 * Existe porque a Places API não devolve `photos` para a chave deste projeto.
 * Busca o próprio nome do negócio a partir das coordenadas dele e casa por
 * `place_id` — sem o casamento, um homônimo próximo devolveria a foto errada,
 * que é pior do que não ter foto.
 */
export async function fotoDoNegocio(
  nome: string,
  placeId: string,
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const resultados = await rankingPeloDataForSeo(nome, lat, lng, 5);
    return resultados.find((r) => r.placeId === placeId)?.foto ?? null;
  } catch {
    // Foto é enfeite: nunca derruba a seleção do negócio.
    return null;
  }
}
