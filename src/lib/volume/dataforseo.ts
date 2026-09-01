import "server-only";

import { serverEnv } from "@/lib/env/server";
import { fetchComRetry } from "@/lib/http";
import {
  BRASIL,
  idNumerico,
  type FonteDeVolume,
  type VolumeDeTermo,
} from "@/lib/volume/tipos";

/**
 * Volume de busca pela API do DataForSEO.
 *
 * Terceira fonte, e a única paga. Entra porque as outras duas dependem de
 * coisas fora do nosso controle: o Google Ads exige um developer token
 * aprovado — que pode demorar ou ser recusado —, e o plano gratuito do
 * Mangools autentica mas não devolve dado.
 *
 * O número aqui é o do Keyword Planner, consultado pelas contas de Ads do
 * próprio DataForSEO. Costuma vir fechado, e não em faixas, porque essas
 * contas têm investimento. Ainda assim é revenda: quando o token do Google
 * sair, `VOLUME_PROVIDER=google-ads` volta a ser a melhor escolha, e é de
 * graça.
 */

const ENDPOINT =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

/**
 * Teto por requisição.
 *
 * O endpoint aceita até mil termos, e a cobrança é **por tarefa**, não por
 * palavra — lotes maiores custam literalmente menos. O teto abaixo do máximo
 * existe só para a falha de um lote não levar a lista inteira junto.
 */
const TERMOS_POR_CHAMADA = 700;

/**
 * O DataForSEO usa códigos ISO para idioma, e os mesmos códigos numéricos do
 * Google para localidade — por isso `VOLUME_LOCATION_ID` serve para as duas
 * fontes, mas o idioma precisa desta constante.
 */
const IDIOMA = "pt";

type RespostaDataForSeo = {
  status_code?: number;
  status_message?: string;
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: {
      keyword?: string;
      search_volume?: number | null;
      competition_index?: number | null;
    }[];
  }[];
};

export function dataForSeoConfigurado(): boolean {
  return Boolean(
    serverEnv.DATAFORSEO_AUTH ||
      (serverEnv.DATAFORSEO_LOGIN && serverEnv.DATAFORSEO_PASSWORD),
  );
}

/**
 * Cabeçalho de autenticação.
 *
 * O painel do DataForSEO mostra tanto o par login/senha quanto o valor Base64
 * pronto para o header. Aceitar os dois evita o erro clássico de colar o
 * Base64 no campo de login — que falha com "authentication failed" sem dizer
 * por quê.
 */
function autorizacao(): string {
  if (serverEnv.DATAFORSEO_AUTH) {
    const valor = serverEnv.DATAFORSEO_AUTH.trim();
    return valor.toLowerCase().startsWith("basic ") ? valor : `Basic ${valor}`;
  }

  const par = `${serverEnv.DATAFORSEO_LOGIN}:${serverEnv.DATAFORSEO_PASSWORD}`;
  return `Basic ${Buffer.from(par).toString("base64")}`;
}

export async function volumePeloDataForSeo(
  termos: string[],
): Promise<VolumeDeTermo[]> {
  if (termos.length === 0) return [];
  if (!dataForSeoConfigurado()) {
    throw new Error(
      "DataForSEO não configurado (DATAFORSEO_AUTH, ou DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD).",
    );
  }

  const resultado: VolumeDeTermo[] = [];

  for (let i = 0; i < termos.length; i += TERMOS_POR_CHAMADA) {
    const lote = termos.slice(i, i + TERMOS_POR_CHAMADA);

    const resposta = await fetchComRetry(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          authorization: autorizacao(),
          "content-type": "application/json",
        },
        // O corpo é uma lista de tarefas, mesmo quando há só uma.
        body: JSON.stringify([
          {
            keywords: lote,
            location_code: idNumerico(serverEnv.VOLUME_LOCATION_ID, BRASIL),
            language_code: IDIOMA,
          },
        ]),
      },
      { api: "DataForSEO" },
    );

    const texto = await resposta.text();

    if (!resposta.ok) {
      throw new Error(mensagemDeErro(resposta.status, texto));
    }

    const dados = JSON.parse(texto) as RespostaDataForSeo;

    // O DataForSEO responde 200 mesmo quando recusa: o que importa é o
    // status_code do corpo. 20000 é sucesso; 40200 é saldo insuficiente.
    if (dados.status_code !== 20000) {
      throw new Error(
        `DataForSEO recusou (${dados.status_code}): ${dados.status_message ?? "sem mensagem"}`,
      );
    }

    const tarefa = dados.tasks?.[0];
    if (tarefa && tarefa.status_code !== 20000) {
      throw new Error(
        `DataForSEO recusou a tarefa (${tarefa.status_code}): ${tarefa.status_message ?? "sem mensagem"}`,
      );
    }

    const porTermo = new Map<string, VolumeDeTermo>();
    for (const item of tarefa?.result ?? []) {
      if (!item.keyword) continue;
      porTermo.set(item.keyword.toLowerCase(), {
        termo: item.keyword,
        // `search_volume` nulo é ausência de dado, não zero de buscas.
        volume: typeof item.search_volume === "number" ? item.search_volume : null,
        concorrencia:
          typeof item.competition_index === "number"
            ? item.competition_index
            : null,
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

function mensagemDeErro(status: number, detalhe: string): string {
  if (status === 401) {
    return (
      "DataForSEO recusou as credenciais (401). Confira se está usando a " +
      "senha de API do painel, e não a senha da conta."
    );
  }
  if (status === 402) {
    return "DataForSEO sem saldo (402). Recarregue a conta para voltar a consultar.";
  }
  return `DataForSEO respondeu ${status}: ${detalhe.slice(0, 200)}`;
}

export const fonteDataForSeo: FonteDeVolume = {
  nome: "DataForSEO",
  configurada: dataForSeoConfigurado,
  buscar: volumePeloDataForSeo,
};
