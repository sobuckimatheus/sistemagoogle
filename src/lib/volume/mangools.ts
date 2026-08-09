import "server-only";

import { serverEnv } from "@/lib/env/server";
import { fetchComRetry } from "@/lib/http";
import {
  BRASIL,
  idNumerico,
  PORTUGUES,
  type FonteDeVolume,
  type VolumeDeTermo,
} from "@/lib/volume/tipos";

/**
 * Volume de busca pela API do KWFinder (Mangools).
 *
 * Serve de ponte enquanto o developer token do Google Ads não é aprovado:
 * exige só uma chave de API, sem MCC e sem espera. O dado vem do Keyword
 * Planner, então é o mesmo número de origem — mas o número *público* do
 * Planner, que é arredondado em faixas. Uma conta do Ads com investimento
 * ativo continua entregando mais precisão, e é para lá que se deve voltar.
 *
 * Um termo repetido dentro de 24h não conta de novo no limite de lookups, o
 * que combina com o nosso ciclo: o job é mensal e o botão manual tem rate
 * limit próprio.
 */

const ENDPOINT = "https://api.mangools.com/v3/kwfinder/keyword-imports";

/**
 * Teto por requisição.
 *
 * A API aceita até 700 termos e cobra por *lookup*, não por requisição —
 * lotes maiores não gastam mais cota. E como o endpoint responde 429 com
 * facilidade (observado em testes: poucas chamadas seguidas já derrubam),
 * menos requisições é estritamente melhor. O teto abaixo de 700 existe só
 * para a falha de um lote não levar a lista inteira junto.
 */
const TERMOS_POR_CHAMADA = 400;

/** Pausa entre lotes, para não disparar o limite do próprio endpoint. */
const PAUSA_ENTRE_LOTES_MS = 2000;

/**
 * Tentativas em caso de 429.
 *
 * Baixo de propósito: este código roda tanto no job mensal quanto atrás de um
 * botão. Insistir muito faria o usuário esperar em uma tela travada por algo
 * que ele não controla.
 */
const TENTATIVAS_NO_429 = 2;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RespostaKwFinder = {
  data?: {
    kw?: string;
    keyword?: string;
    sv?: number | null;
    cpc?: number | null;
    /** Concorrência de anunciantes, 0–1 na escala do KWFinder. */
    ppc?: number | null;
  }[];
};

export function mangoolsConfigurado(): boolean {
  return Boolean(serverEnv.MANGOOLS_API_TOKEN);
}

export async function volumePeloMangools(
  termos: string[],
): Promise<VolumeDeTermo[]> {
  if (termos.length === 0) return [];
  if (!mangoolsConfigurado()) {
    throw new Error("MANGOOLS_API_TOKEN não configurada.");
  }

  const resultado: VolumeDeTermo[] = [];

  for (let i = 0; i < termos.length; i += TERMOS_POR_CHAMADA) {
    if (i > 0) await espera(PAUSA_ENTRE_LOTES_MS);

    const lote = termos.slice(i, i + TERMOS_POR_CHAMADA);
    const dados = await pedirLote(lote);

    const porTermo = new Map<string, VolumeDeTermo>();
    for (const item of dados.data ?? []) {
      const termo = item.kw ?? item.keyword;
      if (!termo) continue;

      porTermo.set(termo.toLowerCase(), {
        termo,
        volume: typeof item.sv === "number" ? item.sv : null,
        // O KWFinder devolve concorrência de 0 a 1; o resto do sistema
        // trabalha em 0–100, como o Google Ads.
        concorrencia:
          typeof item.ppc === "number" ? Math.round(item.ppc * 100) : null,
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
 * Uma requisição, respeitando o `retry_after` do 429.
 *
 * O `fetchComRetry` genérico não resolve aqui: ele lê o cabeçalho
 * `Retry-After`, e este provedor manda o tempo de espera **no corpo JSON**.
 * Sem ler de lá, o backoff exponencial padrão (meio segundo, um segundo)
 * tentaria de novo antes da hora e só renovaria a punição.
 */
async function pedirLote(lote: string[]): Promise<RespostaKwFinder> {
  const corpo = JSON.stringify({
    keywords: lote,
    location_id: idNumerico(serverEnv.VOLUME_LOCATION_ID, BRASIL),
    language_id: idNumerico(serverEnv.VOLUME_LANGUAGE_ID, PORTUGUES),
  });

  for (let tentativa = 0; tentativa <= TENTATIVAS_NO_429; tentativa++) {
    const resposta = await fetchComRetry(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "x-access-token": serverEnv.MANGOOLS_API_TOKEN!,
          "content-type": "application/json",
        },
        body: corpo,
      },
      // Sem retry interno: o 429 deste provedor é tratado logo abaixo, e
      // repetir antes de ler o `retry_after` só piora.
      { api: "Mangools", tentativas: 1 },
    );

    const texto = await resposta.text();

    if (resposta.ok) return JSON.parse(texto) as RespostaKwFinder;

    if (resposta.status === 429 && tentativa < TENTATIVAS_NO_429) {
      const segundos = segundosDeEspera(texto);
      await espera((segundos + 1) * 1000);
      continue;
    }

    throw new Error(mensagemDeErro(resposta.status, texto));
  }

  throw new Error(
    "Mangools recusou por limite de requisições depois de várias tentativas.",
  );
}

function segundosDeEspera(texto: string): number {
  try {
    const corpo = JSON.parse(texto) as { error?: { retry_after?: number } };
    const valor = corpo.error?.retry_after;
    // Teto: um provedor pedindo minutos de espera não pode segurar uma
    // requisição de usuário. Nesse caso é melhor falhar e avisar.
    return typeof valor === "number" && valor > 0 ? Math.min(valor, 20) : 10;
  } catch {
    return 10;
  }
}

function mensagemDeErro(status: number, detalhe: string): string {
  if (status === 401 || status === 403) {
    return `Mangools recusou a chave (${status}): token inválido ou plano sem acesso à API. ${detalhe.slice(0, 200)}`;
  }
  if (status === 429) {
    return (
      "Mangools está limitando as requisições (429). No plano gratuito isso " +
      "acontece com poucas chamadas seguidas — espere alguns minutos e tente " +
      "de novo."
    );
  }
  return `Mangools respondeu ${status}: ${detalhe.slice(0, 200)}`;
}

export const fonteMangools: FonteDeVolume = {
  nome: "Mangools (KWFinder)",
  configurada: mangoolsConfigurado,
  buscar: volumePeloMangools,
};
