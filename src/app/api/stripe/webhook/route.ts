import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { statusDoStripe } from "@/lib/billing/plano";
import { stripe, StripeNaoConfiguradoError } from "@/lib/billing/stripe";
import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Webhook do Stripe (E9-04).
 *
 * Três garantias, nesta ordem:
 *
 * 1. **Autenticidade** — a assinatura é conferida sobre o corpo cru. Sem isso
 *    qualquer um ativaria um plano com um POST.
 * 2. **Idempotência** — o id do evento é gravado como chave primária *antes*
 *    do processamento. O Stripe reentrega em caso de timeout, e duas entregas
 *    podem chegar em paralelo; a violação de unicidade é a única checagem
 *    atômica disponível.
 * 3. **Resposta rápida com erro honesto** — falha nossa devolve 500 para o
 *    Stripe reentregar; evento que não sabemos tratar devolve 200, senão ele
 *    reentrega para sempre.
 */
export async function POST(request: NextRequest) {
  if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET não configurada.");
    return NextResponse.json({ erro: "webhook não configurado" }, { status: 503 });
  }

  const assinatura = request.headers.get("stripe-signature");
  if (!assinatura) {
    return NextResponse.json({ erro: "sem assinatura" }, { status: 400 });
  }

  // Corpo cru: qualquer parse antes da verificação invalida a assinatura.
  const corpo = await request.text();

  let evento: Stripe.Event;
  try {
    evento = stripe().webhooks.constructEvent(
      corpo,
      assinatura,
      serverEnv.STRIPE_WEBHOOK_SECRET,
    );
  } catch (erro) {
    if (erro instanceof StripeNaoConfiguradoError) {
      return NextResponse.json({ erro: "billing desligado" }, { status: 503 });
    }
    // Assinatura inválida é 400: não adianta o Stripe reentregar.
    return NextResponse.json(
      { erro: `assinatura inválida: ${(erro as Error).message}` },
      { status: 400 },
    );
  }

  try {
    await prisma.stripeEvent.create({
      data: { id: evento.id, type: evento.type },
    });
  } catch {
    // Já processado. 200 para o Stripe parar de reentregar.
    return NextResponse.json({ recebido: true, duplicado: true });
  }

  try {
    await processar(evento);
  } catch (erro) {
    // Libera o id para que a reentrega do Stripe tenha efeito — do contrário
    // o evento ficaria marcado como processado sem ter sido.
    await prisma.stripeEvent
      .delete({ where: { id: evento.id } })
      .catch(() => undefined);

    console.error(
      `[stripe] falha ao processar ${evento.type} (${evento.id}): ${(erro as Error).message}`,
    );
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 });
  }

  return NextResponse.json({ recebido: true });
}

async function processar(evento: Stripe.Event): Promise<void> {
  switch (evento.type) {
    case "checkout.session.completed": {
      const sessao = evento.data.object;
      const accountId =
        sessao.client_reference_id ?? sessao.metadata?.accountId ?? null;

      if (!accountId || !sessao.subscription) return;

      const assinaturaStripe = await stripe().subscriptions.retrieve(
        String(sessao.subscription),
      );

      await sincronizarAssinatura(accountId, assinaturaStripe);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const assinaturaStripe = evento.data.object;
      const accountId = await accountIdDa(assinaturaStripe);
      if (!accountId) return;

      await sincronizarAssinatura(accountId, assinaturaStripe);
      return;
    }

    case "invoice.payment_failed": {
      const fatura = evento.data.object;
      if (!fatura.customer) return;

      // Não deriva o status daqui: o evento de assinatura chega junto e é a
      // fonte correta. Este só antecipa o bloqueio quando ele vier atrasado.
      await prisma.subscription.updateMany({
        where: {
          stripeCustomerId: String(fatura.customer),
          status: { in: ["ACTIVE", "TRIALING"] },
        },
        data: { status: "PAST_DUE" },
      });
      return;
    }

    default:
      // Evento que não interessa ao produto. Silêncio é a resposta certa.
      return;
  }
}

/**
 * Descobre a conta dona da assinatura.
 *
 * O metadata é o caminho normal; o customer é a rede de segurança para
 * assinaturas criadas fora do nosso checkout (pelo dashboard do Stripe, por
 * exemplo).
 */
async function accountIdDa(
  assinatura: Stripe.Subscription,
): Promise<string | null> {
  const doMetadata = assinatura.metadata?.accountId;
  if (doMetadata) return doMetadata;

  const existente = await prisma.subscription.findFirst({
    where: { stripeCustomerId: String(assinatura.customer) },
    select: { accountId: true },
  });

  return existente?.accountId ?? null;
}

/**
 * Espelha no banco o estado que o Stripe acabou de informar.
 *
 * O plano vem do preço da assinatura, não do metadata: no upgrade feito pelo
 * portal do Stripe o metadata continua com o plano antigo, e o preço é o que
 * de fato está sendo cobrado.
 */
async function sincronizarAssinatura(
  accountId: string,
  assinatura: Stripe.Subscription,
): Promise<void> {
  const priceId = assinatura.items.data[0]?.price.id;

  const plano = priceId
    ? await prisma.plan.findFirst({ where: { stripePriceId: priceId } })
    : null;

  const item = assinatura.items.data[0];
  const fimDoPeriodo = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  const status = statusDoStripe(assinatura.status);

  // Assinatura cancelada volta para o FREE em vez de ficar apontando para um
  // plano pago que ninguém está pagando — é o que mantém os limites coerentes
  // com o que a conta tem direito.
  const planoDestino =
    status === "CANCELED"
      ? await prisma.plan.findUnique({ where: { tier: "FREE" } })
      : plano;

  await prisma.subscription.update({
    where: { accountId },
    data: {
      status,
      stripeCustomerId: String(assinatura.customer),
      stripeSubscriptionId: assinatura.id,
      currentPeriodEnd: fimDoPeriodo,
      cancelAtPeriodEnd: assinatura.cancel_at_period_end,
      ...(planoDestino ? { planId: planoDestino.id } : {}),
    },
  });
}
