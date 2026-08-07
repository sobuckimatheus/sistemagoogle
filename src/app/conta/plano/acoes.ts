"use server";

import { redirect } from "next/navigation";

import { exigirContaAtiva, exigirOwner } from "@/lib/auth/conta";
import { stripe, StripeNaoConfiguradoError } from "@/lib/billing/stripe";
import { clientEnv } from "@/lib/env/client";
import { prisma } from "@/lib/prisma";

export type EstadoPlano = { erro: string } | null;

const VOLTA_PARA = `${clientEnv.NEXT_PUBLIC_APP_URL}/conta/plano`;

/**
 * Abre o checkout do Stripe para o plano escolhido (E9-03).
 *
 * Não cria nem altera `Subscription` aqui: quem faz isso é o webhook, ao
 * receber a confirmação do Stripe. Marcar como pago no retorno do navegador
 * seria confiar em quem pode simplesmente digitar a URL de sucesso.
 *
 * `client_reference_id` e o metadata carregam o `accountId` para que o webhook
 * saiba de quem é o pagamento mesmo quando o customer é novo.
 */
export async function irParaCheckout(
  _anterior: EstadoPlano,
  formData: FormData,
): Promise<EstadoPlano> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const planId = String(formData.get("planId") ?? "");

  const plano = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plano) return { erro: "Plano não encontrado." };
  if (!plano.stripePriceId) {
    return {
      erro: `O plano ${plano.name} ainda não tem preço configurado no Stripe (Plan.stripePriceId).`,
    };
  }

  const assinatura = await prisma.subscription.findUnique({
    where: { accountId: conta.id },
  });

  let url: string | null = null;

  try {
    const sessao = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plano.stripePriceId, quantity: 1 }],
      // Reaproveita o customer quando já existe; sem isso, cada compra cria um
      // cliente novo no Stripe e o histórico de cobrança fica fragmentado.
      ...(assinatura?.stripeCustomerId
        ? { customer: assinatura.stripeCustomerId }
        : { customer_email: user.email }),
      client_reference_id: conta.id,
      subscription_data: {
        metadata: { accountId: conta.id, planId: plano.id },
      },
      metadata: { accountId: conta.id, planId: plano.id },
      success_url: `${VOLTA_PARA}?checkout=ok`,
      cancel_url: `${VOLTA_PARA}?checkout=cancelado`,
      allow_promotion_codes: true,
    });

    url = sessao.url;
  } catch (erro) {
    if (erro instanceof StripeNaoConfiguradoError) {
      return {
        erro: "Billing ainda não está configurado. Defina STRIPE_SECRET_KEY.",
      };
    }
    return { erro: `Stripe recusou a criação do checkout: ${(erro as Error).message}` };
  }

  if (!url) return { erro: "O Stripe não devolveu a URL do checkout." };

  // redirect() fora do try: ele funciona lançando uma exceção de controle, que
  // o catch acima engoliria como se fosse falha do Stripe.
  redirect(url);
}

/**
 * Abre o portal de cobrança do Stripe (E9-07).
 *
 * Trocar cartão, ver faturas e cancelar acontecem lá, não aqui: recriar essas
 * telas significaria manter regras de cobrança em dois lugares e lidar com
 * dados de cartão sem necessidade.
 */
// Sem parâmetros de propósito: o portal não depende do estado anterior nem do
// formulário, e uma função de aridade menor continua válida para
// `useActionState`.
export async function abrirPortal(): Promise<EstadoPlano> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const assinatura = await prisma.subscription.findUnique({
    where: { accountId: conta.id },
  });

  if (!assinatura?.stripeCustomerId) {
    return {
      erro: "Esta conta ainda não tem cobrança no Stripe. Assine um plano primeiro.",
    };
  }

  let url: string;

  try {
    const sessao = await stripe().billingPortal.sessions.create({
      customer: assinatura.stripeCustomerId,
      return_url: VOLTA_PARA,
    });
    url = sessao.url;
  } catch (erro) {
    if (erro instanceof StripeNaoConfiguradoError) {
      return {
        erro: "Billing ainda não está configurado. Defina STRIPE_SECRET_KEY.",
      };
    }
    return { erro: `Stripe recusou a abertura do portal: ${(erro as Error).message}` };
  }

  redirect(url);
}
