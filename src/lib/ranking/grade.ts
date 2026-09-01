import "server-only";

import { rankingLocal } from "@/lib/ranking";
import type { ResultadoLocal } from "@/lib/ranking/tipos";

/**
 * Posição de um negócio no Maps, medida em grade.
 *
 * Medir de um ponto só não serve, e o pior ponto possível é o endereço do
 * próprio negócio: ali a distância é zero, o Maps ordena por proximidade além
 * de relevância, e **todo mundo é primeiro lugar**. Um número que nunca dói
 * não informa nada.
 *
 * A grade resolve isso medindo 25 pontos ao redor e tirando a média. Duas
 * armadilhas que já custaram caro e estão evitadas aqui:
 *
 * 1. **Não existe ranking agregado de concorrentes.** Tentei montar um, e ele
 *    é enviesado por construção: o negócio analisado fica no centro da grade,
 *    então aparece em mais pontos que qualquer concorrente e vence sempre a
 *    média com penalidade por ausência. Uma pizzaria que some em sete pontos
 *    aparecia em 1º com 14,6 contra 15,2 do segundo — diferença sem
 *    significado.
 * 2. **A lista da tela é uma busca real**, feita de um ponto onde o negócio
 *    está na posição média dele. Ranking do Google já vem com posições
 *    distintas e sem empate, e o negócio aparece nele exatamente na posição da
 *    manchete, porque foi dali que o número saiu.
 */

/** Lado da grade. 5x5 = 25 pontos, o padrão do setor. */
const LADO = 5;

/**
 * Distância entre pontos, em km.
 *
 * 1,5 km põe os cantos a 4,2 km do negócio — a área que um comércio local de
 * fato disputa. Calibrado contra dois negócios reais, com o número que o
 * Localo publica para eles:
 *
 * | espaçamento | Dra. Samantha (Localo: 3) | Somare (Localo: 16) |
 * |---|---|---|
 * | 3 km   | 7  | 14 |
 * | 1,5 km | 3  | 9  |
 *
 * Nenhum valor único reproduz os dois: o Localo distribui os pontos de forma
 * não uniforme, densos no centro e esparsos fora. **Aumentar este número piora
 * a posição de todo mundo; diminuir melhora.** É a alavanca de severidade da
 * ferramenta.
 */
const ESPACAMENTO_KM = 1.5;

/** Profundidade da busca: além disso ninguém é encontrado. */
const FORA_DA_LISTA = 21;

/**
 * Quanto pesa não aparecer entre os 20 primeiros.
 *
 * Contar ausência como 21 — o mínimo aritmético — diz que sumir da lista é
 * quase tão bom quanto ser o vigésimo. Não é: quem não aparece no top 20 não
 * é encontrado, ponto. A penalidade maior é o que separa "está em último" de
 * "está invisível".
 *
 * O valor saiu de calibração contra dois negócios reais, com o número que o
 * Localo publica para eles no mesmo dia:
 *
 * | penalidade | Somare (Localo: 18) | Dra. Samantha (Localo: 3) |
 * |---|---|---|
 * | 21 | 10 | 3 |
 * | 40 | 15 | 3 |
 * | **50** | **18** | **3** |
 *
 * A Samantha não se move com o parâmetro porque aparece nos 25 pontos —
 * ausência não a toca. É o que dá alguma confiança no ajuste: ele move só
 * quem tem o problema que ele mede.
 */
const PENALIDADE_AUSENCIA = 50;

const KM_POR_GRAU = 111.32;

export type PontoDaGrade = {
  /** Posição no ponto; `null` quando não aparece entre os 20 primeiros. */
  posicao: number | null;
  /** `true` quando o Google não devolveu resultado nenhum ali. */
  semMercado: boolean;
};

export type MedicaoEmGrade = {
  /**
   * Posição média na região, contando ausência como 21 — inteira, pelo piso.
   *
   * Piso e não arredondamento: quem tem média 3,7 aparece em terceiro na
   * maioria das buscas, e promovê-lo a 4º descreveria pior o que o cliente vê.
   */
  posicaoMedia: number | null;
  /** A mesma média, com fração. Serve para comparar duas medições no tempo. */
  posicaoMediaExata: number | null;
  /** 0 a 1. Quanto da região enxerga o negócio, com peso maior no topo. */
  visibilidade: number;
  posicaoTipica: number | null;
  naPorta: number | null;
  pontosComMercado: number;
  pontosOndeAparece: number;
  totalPontos: number;
  pontos: PontoDaGrade[];
  /** Busca real do Google, de um ponto onde o negócio está na média dele. */
  ranking: ResultadoLocal[];
  /** A que distância do negócio fica esse ponto, em km. */
  kmDoPontoDaLista: number;
};

function coordenadasDaGrade(lat: number, lng: number) {
  const meio = Math.floor(LADO / 2);
  const pontos: { lat: number; lng: number; centro: boolean; km: number }[] = [];

  for (let linha = 0; linha < LADO; linha++) {
    for (let coluna = 0; coluna < LADO; coluna++) {
      const norteKm = (meio - linha) * ESPACAMENTO_KM;
      const lesteKm = (coluna - meio) * ESPACAMENTO_KM;

      pontos.push({
        lat: lat + norteKm / KM_POR_GRAU,
        // A longitude encolhe conforme se afasta do equador; sem o cosseno,
        // "1,5 km a leste" no sul do Brasil viraria quase 1,7 km.
        lng: lng + lesteKm / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180)),
        centro: linha === meio && coluna === meio,
        km: Math.round(Math.hypot(norteKm, lesteKm) * 10) / 10,
      });
    }
  }

  return pontos;
}

/** Executa em lotes: 25 chamadas de uma vez costumam esbarrar no provedor. */
async function emLotes<T>(
  tarefas: (() => Promise<T>)[],
  tamanho = 8,
): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < tarefas.length; i += tamanho) {
    saida.push(
      ...(await Promise.all(tarefas.slice(i, i + tamanho).map((f) => f()))),
    );
  }
  return saida;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

export async function medirEmGrade(
  termo: string,
  lat: number,
  lng: number,
  placeId: string,
  nome: string,
): Promise<MedicaoEmGrade> {
  const coordenadas = coordenadasDaGrade(lat, lng);

  const medicoes = await emLotes(
    coordenadas.map((p) => async () => {
      try {
        return { ...p, ranking: await rankingLocal(termo, p.lat, p.lng) };
      } catch {
        // Um ponto que falha não pode derrubar os outros vinte e quatro.
        return { ...p, ranking: [] as ResultadoLocal[], falhou: true };
      }
    }),
  );

  if (medicoes.every((m) => "falhou" in m && m.falhou)) {
    throw new Error("Nenhum ponto de medição respondeu.");
  }

  const pontos: PontoDaGrade[] = medicoes.map((m) => {
    const achado =
      m.ranking.find((r) => r.placeId === placeId) ??
      m.ranking.find((r) => r.titulo.toLowerCase() === nome.toLowerCase());

    return {
      posicao: achado?.posicao ?? null,
      // Sem resultado nenhum não é o negócio que está mal posicionado: é uma
      // área onde esse serviço não existe. Contar isso contra ele puniria quem
      // tem mato em volta.
      semMercado: m.ranking.length === 0,
    };
  });

  const indicesComMercado = pontos
    .map((p, i) => (p.semMercado ? -1 : i))
    .filter((i) => i >= 0);

  const comMercado = indicesComMercado.map((i) => pontos[i]);
  const encontradas = comMercado
    .map((p) => p.posicao)
    .filter((p): p is number => p !== null);

  const visibilidade =
    comMercado.length === 0
      ? 0
      : comMercado.reduce(
          (soma, p) =>
            soma + (p.posicao ? Math.max(0, (FORA_DA_LISTA - p.posicao) / 20) : 0),
          0,
        ) / comMercado.length;

  const media =
    comMercado.length === 0
      ? null
      : comMercado.reduce(
          (s, p) => s + (p.posicao ?? PENALIDADE_AUSENCIA),
          0,
        ) / comMercado.length;

  // Nunca encontrado em lugar nenhum não é "posição 50": é ausência, e a tela
  // diz isso com palavras em vez de um número que não significa nada.
  const posicaoMedia =
    media === null || encontradas.length === 0
      ? null
      : Math.max(1, Math.floor(media));

  /**
   * Ponto que a lista vai mostrar: aquele onde o negócio está mais perto da
   * própria média.
   *
   * É o que faz a lista e a manchete serem o mesmo fato, e não dois números
   * que precisam ser reconciliados depois — foi exatamente aí que as
   * tentativas anteriores falharam.
   */
  const candidatos = indicesComMercado.filter(
    (i) => pontos[i].posicao !== null && medicoes[i].ranking.length > 0,
  );

  const indiceDaLista =
    posicaoMedia === null || candidatos.length === 0
      ? medicoes.findIndex((m) => m.centro)
      : candidatos.reduce((melhor, atual) =>
          Math.abs(pontos[atual].posicao! - posicaoMedia) <
          Math.abs(pontos[melhor].posicao! - posicaoMedia)
            ? atual
            : melhor,
        );

  const escolhido = medicoes[Math.max(indiceDaLista, 0)];

  return {
    posicaoMedia,
    posicaoMediaExata: media === null ? null : Math.round(media * 10) / 10,
    visibilidade,
    posicaoTipica: mediana(encontradas),
    naPorta: pontos[medicoes.findIndex((m) => m.centro)]?.posicao ?? null,
    pontosComMercado: comMercado.length,
    pontosOndeAparece: encontradas.length,
    totalPontos: pontos.length,
    pontos,
    ranking: escolhido.ranking,
    kmDoPontoDaLista: escolhido.km,
  };
}
