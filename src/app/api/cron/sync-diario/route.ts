import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma";
import { sincronizarNegocio } from "@/lib/sync/negocio";

export const runtime = "nodejs";
// Sync de várias contas não cabe no limite padrão de execução.
export const maxDuration = 300;

/**
 * Sync diário de todos os negócios ativos.
 *
 * Sem este job o produto não funciona como descrito: não há série histórica,
 * não há "vs. período anterior" e não há alertas. É infraestrutura, não
 * otimização.
 *
 * Protegido por segredo em vez de sessão — quem chama é o agendador, não um
 * usuário. A comparação é em tempo constante para não vazar o segredo pelo
 * tempo de resposta.
 */
export async function GET(request: NextRequest) {
  const autorizacao = request.headers.get("authorization") ?? "";
  const recebido = autorizacao.replace(/^Bearer\s+/i, "");

  if (!segredoConfere(recebido, serverEnv.CRON_SECRET)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const negocios = await prisma.business.findMany({
    where: {
      status: "ACTIVE",
      googleConnection: { status: "ACTIVE" },
    },
    select: { id: true, title: true },
  });

  const resultados = [];
  for (const negocio of negocios) {
    try {
      resultados.push(await sincronizarNegocio(negocio.id));
    } catch (erro) {
      // Um negócio com problema não pode interromper a fila dos outros.
      resultados.push({
        businessId: negocio.id,
        erro: (erro as Error).message,
      });
    }
  }

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    negocios: negocios.length,
    resultados,
  });
}
