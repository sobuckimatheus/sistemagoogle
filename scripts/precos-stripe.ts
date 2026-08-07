/**
 * Cria no Stripe um produto e um preço mensal para cada plano pago do banco,
 * e grava o id do preço em `Plan.stripePriceId` (E9-01).
 *
 * Rodar com:  pnpm stripe:precos
 *
 * Idempotente: plano que já tem `stripePriceId` é pulado. Rodar duas vezes não
 * cria produto duplicado nem muda preço de quem já assinou — no Stripe, preço
 * é imutável, então mudar valor significa criar outro preço e migrar as
 * assinaturas pelo dashboard.
 *
 * Fonte de verdade dos valores é a tabela `plans`, não este script: ajuste o
 * preço lá antes de rodar (E9-02).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

async function main() {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) {
    throw new Error("STRIPE_SECRET_KEY não definida — preencha o .env.");
  }

  const stripe = new Stripe(chave, { apiVersion: "2026-07-29.dahlia" });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const planos = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });

  for (const plano of planos) {
    if (plano.priceCents === 0) {
      console.log(`· ${plano.name}: grátis, não precisa de preço no Stripe.`);
      continue;
    }

    if (plano.stripePriceId) {
      console.log(`· ${plano.name}: já tem preço (${plano.stripePriceId}).`);
      continue;
    }

    const produto = await stripe.products.create({
      name: `Painel GBP — ${plano.name}`,
      description: `${plano.maxBusinesses} negócio(s) e ${plano.maxKeywords} palavras-chave.`,
      metadata: { tier: plano.tier, planId: plano.id },
    });

    const preco = await stripe.prices.create({
      product: produto.id,
      currency: "brl",
      unit_amount: plano.priceCents,
      recurring: { interval: "month" },
      metadata: { tier: plano.tier },
    });

    await prisma.plan.update({
      where: { id: plano.id },
      data: { stripePriceId: preco.id },
    });

    console.log(
      `✓ ${plano.name}: produto ${produto.id}, preço ${preco.id} ` +
        `(R$ ${(plano.priceCents / 100).toFixed(2)}/mês)`,
    );
  }

  await prisma.$disconnect();
  console.log(
    "\nFalta registrar o webhook no Stripe apontando para /api/stripe/webhook.",
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
