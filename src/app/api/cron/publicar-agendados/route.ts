import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma";
import { publicarPostSalvo } from "@/lib/sync/publicar";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Publica os posts agendados cuja hora chegou.
 *
 * Roda de hora em hora. Precisão de minuto exigiria cron por minuto, o que
 * não se justifica: ninguém agenda post para um instante exato, e o custo de
 * invocação seria 60x maior.
 */
export async function GET(request: NextRequest) {
  const recebido = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (!segredoConfere(recebido, serverEnv.CRON_SECRET)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const vencidos = await prisma.post.findMany({
    where: {
      state: "SCHEDULED",
      scheduledFor: { lte: new Date() },
      business: { status: "ACTIVE" },
    },
    select: { id: true },
    // Teto por execução: uma fila enorme não pode estourar o tempo limite da
    // função e deixar tudo sem publicar.
    take: 50,
  });

  const resultados = [];
  for (const post of vencidos) {
    resultados.push({ postId: post.id, ...(await publicarPostSalvo(post.id)) });
  }

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    vencidos: vencidos.length,
    publicados: resultados.filter((r) => "ok" in r).length,
    falhas: resultados.filter((r) => "erro" in r),
  });
}
