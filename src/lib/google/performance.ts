import "server-only";

import { AllowlistPendenteError } from "@/lib/google/locais";

const BASE = "https://businessprofileperformance.googleapis.com/v1";

/**
 * Métricas diárias do perfil.
 *
 * O Google publica com atraso e **corrige números já entregues**. Por isso o
 * job de sync reprocessa uma janela móvel em vez de buscar só "ontem" — sem
 * isso, o comparativo "vs. período anterior" fica permanentemente errado.
 */

const METRICAS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
] as const;

export type DiaDeDesempenho = {
  data: Date;
  viewsSearch: number;
  viewsMaps: number;
  calls: number;
  websiteClicks: number;
  directionRequests: number;
  conversations: number;
  bookings: number;
};

type ValorDatado = {
  date: { year: number; month: number; day: number };
  value?: string;
};

export async function buscarDesempenhoDiario(
  accessToken: string,
  locationName: string,
  inicio: Date,
  fim: Date,
): Promise<DiaDeDesempenho[]> {
  const url = new URL(
    `${BASE}/${locationName}:fetchMultiDailyMetricsTimeSeries`,
  );
  for (const m of METRICAS) url.searchParams.append("dailyMetrics", m);
  url.searchParams.set("dailyRange.start_date.year", String(inicio.getUTCFullYear()));
  url.searchParams.set("dailyRange.start_date.month", String(inicio.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.start_date.day", String(inicio.getUTCDate()));
  url.searchParams.set("dailyRange.end_date.year", String(fim.getUTCFullYear()));
  url.searchParams.set("dailyRange.end_date.month", String(fim.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.end_date.day", String(fim.getUTCDate()));

  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (resposta.status === 403 || resposta.status === 429) {
    throw new AllowlistPendenteError("Business Profile Performance API");
  }
  if (!resposta.ok) {
    throw new Error(
      `Performance API respondeu ${resposta.status}: ${await resposta.text()}`,
    );
  }

  const dados = (await resposta.json()) as {
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: {
        dailyMetric: string;
        timeSeries?: { datedValues?: ValorDatado[] };
      }[];
    }[];
  };

  // A resposta vem por métrica; o banco guarda por dia. Esta transposição é o
  // motivo de a função existir.
  const porDia = new Map<string, DiaDeDesempenho>();

  const acumular = (
    valores: ValorDatado[] | undefined,
    aplicar: (dia: DiaDeDesempenho, valor: number) => void,
  ) => {
    for (const dv of valores ?? []) {
      const chave = `${dv.date.year}-${dv.date.month}-${dv.date.day}`;
      const dia =
        porDia.get(chave) ??
        ({
          data: new Date(Date.UTC(dv.date.year, dv.date.month - 1, dv.date.day)),
          viewsSearch: 0,
          viewsMaps: 0,
          calls: 0,
          websiteClicks: 0,
          directionRequests: 0,
          conversations: 0,
          bookings: 0,
        } satisfies DiaDeDesempenho);
      aplicar(dia, Number(dv.value ?? 0));
      porDia.set(chave, dia);
    }
  };

  for (const grupo of dados.multiDailyMetricTimeSeries ?? []) {
    for (const serie of grupo.dailyMetricTimeSeries ?? []) {
      const valores = serie.timeSeries?.datedValues;
      switch (serie.dailyMetric) {
        // Desktop e mobile são somados: o produto expõe "visualizações na
        // Busca" e "no Maps", não a divisão por dispositivo.
        case "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH":
        case "BUSINESS_IMPRESSIONS_MOBILE_SEARCH":
          acumular(valores, (d, v) => (d.viewsSearch += v));
          break;
        case "BUSINESS_IMPRESSIONS_DESKTOP_MAPS":
        case "BUSINESS_IMPRESSIONS_MOBILE_MAPS":
          acumular(valores, (d, v) => (d.viewsMaps += v));
          break;
        case "CALL_CLICKS":
          acumular(valores, (d, v) => (d.calls += v));
          break;
        case "WEBSITE_CLICKS":
          acumular(valores, (d, v) => (d.websiteClicks += v));
          break;
        case "BUSINESS_DIRECTION_REQUESTS":
          acumular(valores, (d, v) => (d.directionRequests += v));
          break;
        case "BUSINESS_CONVERSATIONS":
          acumular(valores, (d, v) => (d.conversations += v));
          break;
        case "BUSINESS_BOOKINGS":
          acumular(valores, (d, v) => (d.bookings += v));
          break;
      }
    }
  }

  return [...porDia.values()].sort(
    (a, b) => a.data.getTime() - b.data.getTime(),
  );
}
