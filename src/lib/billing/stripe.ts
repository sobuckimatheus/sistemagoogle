import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/lib/env/server";

/**
 * Cliente do Stripe.
 *
 * Instanciado sob demanda, e não no topo do módulo, para que o app suba sem
 * credencial de billing — o mesmo critério das outras integrações. Quem chama
 * trata `StripeNaoConfiguradoError` e mostra na tela que o checkout ainda não
 * está disponível, em vez de estourar 500.
 */

export class StripeNaoConfiguradoError extends Error {
  constructor() {
    super("STRIPE_SECRET_KEY não configurada.");
    this.name = "StripeNaoConfiguradoError";
  }
}

export function stripe(): Stripe {
  if (!serverEnv.STRIPE_SECRET_KEY) throw new StripeNaoConfiguradoError();

  return new Stripe(serverEnv.STRIPE_SECRET_KEY, {
    // Sem versão fixa, uma atualização da API do Stripe muda o formato da
    // resposta sem aviso e o webhook passa a ler campo que não existe mais.
    apiVersion: "2026-07-29.dahlia",
    appInfo: { name: "Painel GBP" },
  });
}

export function billingConfigurado(): boolean {
  return Boolean(serverEnv.STRIPE_SECRET_KEY);
}
