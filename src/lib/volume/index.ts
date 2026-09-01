import "server-only";

import { serverEnv } from "@/lib/env/server";
import { googleAdsConfigurado, volumeDeBusca } from "@/lib/google/ads";
import { fonteDataForSeo } from "@/lib/volume/dataforseo";
import { fonteMangools } from "@/lib/volume/mangools";
import type { FonteDeVolume } from "@/lib/volume/tipos";

/**
 * Escolha da fonte de volume de busca.
 *
 * `VOLUME_PROVIDER` decide; sem ela, a preferência é Google Ads quando
 * configurado, porque é o dado de origem e o único que abre a média fechada
 * para contas com investimento ativo. O Mangools entra como ponte enquanto o
 * developer token não é aprovado.
 *
 * Nenhuma fonte configurada não é erro: o produto funciona sem volume, e a
 * tela mostra "indisponível".
 */

const fonteGoogleAds: FonteDeVolume = {
  nome: "Google Ads (Keyword Planner)",
  configurada: googleAdsConfigurado,
  buscar: (termos) => volumeDeBusca(termos),
};

export function fonteDeVolume(): FonteDeVolume | null {
  const escolhida = serverEnv.VOLUME_PROVIDER;

  if (escolhida === "google-ads") {
    return fonteGoogleAds.configurada() ? fonteGoogleAds : null;
  }
  if (escolhida === "mangools") {
    return fonteMangools.configurada() ? fonteMangools : null;
  }
  if (escolhida === "dataforseo") {
    return fonteDataForSeo.configurada() ? fonteDataForSeo : null;
  }

  // Sem escolha explícita: a melhor fonte disponível.
  if (fonteGoogleAds.configurada()) return fonteGoogleAds;
  if (fonteDataForSeo.configurada()) return fonteDataForSeo;
  if (fonteMangools.configurada()) return fonteMangools;

  return null;
}

export type { FonteDeVolume, VolumeDeTermo } from "@/lib/volume/tipos";
