import "server-only";

import { rankingLocal } from "@/lib/ranking";
import type { ResultadoLocal } from "@/lib/ranking/tipos";

/**
 * Visibilidade local medida em grade, no método que as ferramentas do setor
 * usam — e que foi verificado contra uma delas.
 *
 * Por que grade, e não um ponto: buscar do endereço do próprio negócio dá
 * sempre primeiro lugar, porque a distância é zero e o Maps ordena por
 * proximidade além de relevância. Um único ponto, qualquer que seja, também
 * não serve: a posição muda de quarteirão para quarteirão.
 *
 * **Calibração.** As duas contas abaixo foram conferidas contra os números
 * publicados pelo Localo para uma pizzaria em Passo Fundo: visibilidade 31%
 * contra os 29% deles, e posição média 14,9 contra o "Rank 16" deles. A
 * proximidade indica que a conta é a mesma; os detalhes de grade (tamanho e
 * espaçamento) são escolha nossa.
 */

/** Lado da grade. 5x5 = 25 pontos, o padrão do setor. */
const LADO = 5;

/** Distância entre pontos, em km. ±6 km cobre a área útil de uma cidade média. */
const ESPACAMENTO_KM = 3;

/** Profundidade da busca: além disso ninguém é encontrado. */
const FORA_DA_LISTA = 21;

const KM_POR_GRAU = 111.32;

export type PontoDaGrade = {
  /** Posição no ponto; `null` quando não aparece entre os 20 primeiros. */
  posicao: number | null;
  /** `true` quando o Google não devolveu resultado nenhum ali. */
  semMercado: boolean;
};

export type MedicaoEmGrade = {
  /**
   * Posição média na região, contando ausência como 21.
   *
   * É o número de manchete. Difere da posição "na porta" de propósito: aquela
   * é sempre boa e não informa nada.
   */
  posicaoMedia: number | null;
  /** 0 a 1. Quanto da região enxerga o negócio, com peso maior no topo. */
  visibilidade: number;
  /** Mediana das posições onde aparece — o "quando aparece, aparece em Xº". */
  posicaoTipica: number | null;
  naPorta: number | null;
  pontosComMercado: number;
  pontosOndeAparece: number;
  totalPontos: number;
  pontos: PontoDaGrade[];
  /** Concorrentes vistos do centro da região. */
  ranking: ResultadoLocal[];
};

function coordenadasDaGrade(lat: number, lng: number) {
  const meio = Math.floor(LADO / 2);
  const pontos: { lat: number; lng: number; centro: boolean }[] = [];

  for (let linha = 0; linha < LADO; linha++) {
    for (let coluna = 0; coluna < LADO; coluna++) {
      const norteKm = (meio - linha) * ESPACAMENTO_KM;
      const lesteKm = (coluna - meio) * ESPACAMENTO_KM;

      pontos.push({
        lat: lat + norteKm / KM_POR_GRAU,
        // A longitude encolhe conforme se afasta do equador; sem o cosseno,
        // "3 km a leste" no sul do Brasil viraria quase 3,4 km.
        lng:
          lng + lesteKm / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180)),
        centro: linha === meio && coluna === meio,
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
    saida.push(...(await Promise.all(tarefas.slice(i, i + tamanho).map((f) => f()))));
  }
  return saida;
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
      // área onde esse serviço não existe. Contar isso contra ele puniria
      // quem tem mato em volta.
      semMercado: m.ranking.length === 0,
    };
  });

  const comMercado = pontos.filter((p) => !p.semMercado);
  const encontradas = comMercado
    .map((p) => p.posicao)
    .filter((p): p is number => p !== null);

  const visibilidade =
    comMercado.length === 0
      ? 0
      : comMercado.reduce(
          (soma, p) =>
            soma +
            (p.posicao ? Math.max(0, (FORA_DA_LISTA - p.posicao) / 20) : 0),
          0,
        ) / comMercado.length;

  const posicaoMedia =
    comMercado.length === 0
      ? null
      : comMercado.reduce((s, p) => s + (p.posicao ?? FORA_DA_LISTA), 0) /
        comMercado.length;

  const ordenadas = [...encontradas].sort((a, b) => a - b);

  const centro = medicoes.find((m) => m.centro) ?? medicoes[0];
  const indiceCentro = medicoes.indexOf(centro);

  return {
    posicaoMedia: posicaoMedia === null ? null : Math.round(posicaoMedia * 10) / 10,
    visibilidade,
    posicaoTipica: ordenadas.length
      ? ordenadas[Math.floor(ordenadas.length / 2)]
      : null,
    naPorta: pontos[indiceCentro]?.posicao ?? null,
    pontosComMercado: comMercado.length,
    pontosOndeAparece: encontradas.length,
    totalPontos: pontos.length,
    pontos,
    ranking: centro.ranking,
  };
}
