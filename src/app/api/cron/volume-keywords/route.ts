import { NextResponse, type NextRequest } from "next/server";

import { segredoConfere } from "@/lib/crypto";
import { serverEnv } from "@/lib/env/server";
import { executarComRegistro } from "@/lib/sync/execucao";
import { atualizarVolumes, volumesVencidos } from "@/lib/sync/volume";
import { fonteDeVolume } from "@/lib/volume";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Revalidação mensal do volume de busca (E4-10).
 *
 * O Keyword Planner publica média mensal: consultar com mais frequência
 * gastaria operação da API para reescrever o mesmo número. Roda todo dia 1º e
 * processa os termos mais desatualizados primeiro, com teto por execução — em
 * base grande, o que não couber hoje entra na execução seguinte, e a ordem por
 * `volumeSyncedAt` garante que ninguém fique para trás indefinidamente.
 */
export async function GET(request: NextRequest) {
  const recebido = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (!segredoConfere(recebido, serverEnv.CRON_SECRET)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const fonte = fonteDeVolume();
  if (!fonte) {
    return NextResponse.json({
      pulado: "nenhuma fonte de volume configurada",
    });
  }

  const execucao = await executarComRegistro(
    "volume-keywords",
    null,
    async () => {
      const ids = await volumesVencidos();
      const resultado = await atualizarVolumes(ids);

      return {
        resultado: { vencidos: ids.length, ...resultado },
        status: resultado.erro
          ? ("FAILED" as const)
          : resultado.semDado > 0
            ? ("PARTIAL" as const)
            : ("SUCCESS" as const),
        itens: resultado.atualizados,
      };
    },
  );

  if ("pulado" in execucao) {
    return NextResponse.json({ pulado: "já em execução" }, { status: 409 });
  }

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    ...execucao.resultado,
  });
}
