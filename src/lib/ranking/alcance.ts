import "server-only";

import { rankingLocal } from "@/lib/ranking";
import type { ResultadoLocal } from "@/lib/ranking/tipos";

/**
 * Alcance de um negócio no Maps: até que distância ele ainda é encontrado.
 *
 * Existe porque medir do endereço do próprio negócio dá sempre primeiro lugar
 * — a distância dali até ele é zero, e o Maps ordena por relevância **e**
 * proximidade. Medido assim, todo negócio parece líder, o que é inútil para
 * quem quer saber onde está perdendo cliente.
 *
 * Medido em anéis, o número vira uma frase que o dono entende: "você domina
 * dois quarteirões e some a cinco quilômetros". Essa é a informação que ele
 * não tem e que muda decisão.
 *
 * Custo: uma consulta por ponto. Com nove pontos, cerca de US$ 0,018 por
 * verificação — viável só porque a fonte é o DataForSEO; com o plano gratuito
 * do SerpApi (100 buscas por mês) isso seria impensável.
 */

/** Distâncias medidas, em quilômetros. */
const RAIOS_KM = [2, 5];

/** Quatro rumos por anel: o suficiente para revelar assimetria sem multiplicar custo. */
const RUMOS = ["norte", "sul", "leste", "oeste"] as const;

/** Grau de latitude em km — constante o bastante para esta escala. */
const KM_POR_GRAU = 111.32;

export type Anel = {
  km: number;
  /** Posição em cada rumo; `null` quando não apareceu. */
  posicoes: (number | null)[];
  /** Em quantos rumos apareceu. */
  presencas: number;
  /** Posição típica (mediana) entre os rumos em que apareceu. */
  tipica: number | null;
};

export type MedicaoDeAlcance = {
  naPorta: number | null;
  aneis: Anel[];
  /**
   * Maior distância em que ainda é encontrado na maioria dos rumos.
   * `0` significa que só aparece muito perto; `null`, que não apareceu nem na
   * própria porta.
   */
  alcanceKm: number | null;
  /** Ranking usado na lista da tela, e de que distância ele veio. */
  ranking: ResultadoLocal[];
  kmDoRanking: number;
};

function deslocar(
  lat: number,
  lng: number,
  km: number,
  rumo: (typeof RUMOS)[number],
): [number, number] {
  const dLat = km / KM_POR_GRAU;
  // A longitude encolhe conforme se afasta do equador; sem o cosseno, "2 km a
  // leste" no sul do Brasil viraria quase 2,3 km.
  const dLng = km / (KM_POR_GRAU * Math.cos((lat * Math.PI) / 180));

  switch (rumo) {
    case "norte":
      return [lat + dLat, lng];
    case "sul":
      return [lat - dLat, lng];
    case "leste":
      return [lat, lng + dLng];
    case "oeste":
      return [lat, lng - dLng];
  }
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

function posicaoDe(
  ranking: ResultadoLocal[],
  placeId: string,
  nome: string,
): number | null {
  const achado =
    ranking.find((r) => r.placeId === placeId) ??
    ranking.find((r) => r.titulo.toLowerCase() === nome.toLowerCase());
  return achado?.posicao ?? null;
}

export async function medirAlcance(
  termo: string,
  lat: number,
  lng: number,
  placeId: string,
  nome: string,
): Promise<MedicaoDeAlcance> {
  const pontos: { km: number; lat: number; lng: number }[] = [
    { km: 0, lat, lng },
    ...RAIOS_KM.flatMap((km) =>
      RUMOS.map((rumo) => {
        const [la, ln] = deslocar(lat, lng, km, rumo);
        return { km, lat: la, lng: ln };
      }),
    ),
  ];

  // Em paralelo: são consultas independentes, e em série a espera somaria
  // meio minuto na cara do visitante.
  const medicoes = await Promise.all(
    pontos.map(async (p) => ({
      km: p.km,
      ranking: await rankingLocal(termo, p.lat, p.lng),
    })),
  );

  const naPorta = posicaoDe(
    medicoes.find((m) => m.km === 0)!.ranking,
    placeId,
    nome,
  );

  const aneis: Anel[] = RAIOS_KM.map((km) => {
    const doAnel = medicoes.filter((m) => m.km === km);
    const posicoes = doAnel.map((m) => posicaoDe(m.ranking, placeId, nome));
    const encontradas = posicoes.filter((p): p is number => p !== null);

    return {
      km,
      posicoes,
      presencas: encontradas.length,
      tipica: mediana(encontradas),
    };
  });

  // Alcance é o maior anel em que ainda aparece na maioria dos rumos. Exigir
  // maioria, e não uma direção qualquer, evita chamar de "alcance" um caso em
  // que ele só é achado de um lado.
  let alcanceKm: number | null = naPorta === null ? null : 0;
  for (const anel of aneis) {
    if (anel.presencas >= Math.ceil(RUMOS.length / 2)) alcanceKm = anel.km;
  }

  /**
   * A lista mostra o anel onde ele já está perdendo — é ali que estão os
   * concorrentes que ficam com o cliente. Se ele aparece em toda parte, mostra
   * o anel mais distante, que é o mais disputado.
   */
  const anelDaLista =
    aneis.find((a) => a.presencas < RUMOS.length) ?? aneis[aneis.length - 1];

  const medicaoDaLista =
    medicoes.find((m) => m.km === anelDaLista.km) ?? medicoes[0];

  return {
    naPorta,
    aneis,
    alcanceKm,
    ranking: medicaoDaLista.ranking,
    kmDoRanking: medicaoDaLista.km,
  };
}
