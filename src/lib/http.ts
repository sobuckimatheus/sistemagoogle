import "server-only";

/**
 * Fetch com retry e backoff exponencial.
 *
 * Sem isso, um 429 momentâneo do SerpApi ou um 503 do Google derruba o job
 * inteiro — e o próximo sync só acontece no dia seguinte, deixando um buraco
 * permanente na série histórica.
 *
 * O que **não** é repetido: 4xx que não seja 429. Um 400 ou 403 não melhora
 * com insistência, e repetir só queima cota.
 */

const STATUS_RETENTAVEIS = new Set([408, 429, 500, 502, 503, 504]);

export type OpcoesRetry = {
  tentativas?: number;
  baseMs?: number;
  tetoMs?: number;
  /** Nome da API, usado nas mensagens de erro. */
  api?: string;
};

export async function fetchComRetry(
  url: string | URL,
  init?: RequestInit,
  opcoes: OpcoesRetry = {},
): Promise<Response> {
  const { tentativas = 3, baseMs = 500, tetoMs = 8000, api = "API" } = opcoes;

  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (tentativa > 0) {
      await esperar(atraso(tentativa, baseMs, tetoMs));
    }

    try {
      const resposta = await fetch(url, init);

      if (!STATUS_RETENTAVEIS.has(resposta.status)) {
        return resposta;
      }

      // Última tentativa: devolve a resposta para quem chamou tratar o
      // status, em vez de lançar um erro genérico que perde o corpo.
      if (tentativa === tentativas - 1) {
        return resposta;
      }

      // O servidor pode dizer quanto esperar; respeitar isso é o que evita
      // ser bloqueado por insistência.
      const retryAfter = resposta.headers.get("retry-after");
      if (retryAfter) {
        const segundos = Number(retryAfter);
        if (Number.isFinite(segundos)) {
          await esperar(Math.min(segundos * 1000, tetoMs));
        }
      }
    } catch (erro) {
      // Falha de rede: vale repetir.
      ultimoErro = erro;
      if (tentativa === tentativas - 1) {
        throw new Error(
          `${api} inacessível após ${tentativas} tentativas: ${
            (erro as Error).message
          }`,
        );
      }
    }
  }

  throw new Error(
    `${api} falhou após ${tentativas} tentativas: ${String(ultimoErro)}`,
  );
}

/**
 * Backoff exponencial com jitter.
 *
 * O jitter existe para que várias execuções que falharam juntas não voltem
 * juntas — do contrário elas se sincronizam e recriam o pico que causou o
 * erro.
 */
function atraso(tentativa: number, baseMs: number, tetoMs: number): number {
  const exponencial = Math.min(baseMs * 2 ** (tentativa - 1), tetoMs);
  return exponencial / 2 + Math.random() * (exponencial / 2);
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
