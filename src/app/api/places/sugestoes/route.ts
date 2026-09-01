import { NextResponse, type NextRequest } from "next/server";

import { exigirContaAtiva } from "@/lib/auth/conta";
import {
  detalhesDoLugar,
  PlacesIndisponivelError,
  sugerirNegocios,
} from "@/lib/google/places";
import { consumirCota, LIMITES } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Autocomplete de negócios e detalhamento do escolhido.
 *
 * Rota, e não Server Action, porque isto responde a cada tecla digitada:
 * Server Actions são enfileiradas em ordem e uma digitação rápida ficaria
 * esperando a anterior terminar.
 *
 * Exige sessão: a chave da Places API é cobrada por uso, e um endpoint aberto
 * seria uma conta de terceiros pagando a busca de qualquer um.
 */
export async function GET(request: NextRequest) {
  const { conta } = await exigirContaAtiva();

  const { searchParams } = request.nextUrl;
  const placeId = searchParams.get("placeId");
  const texto = (searchParams.get("q") ?? "").trim();
  const sessao = searchParams.get("sessao") ?? undefined;

  // Duas teclas ainda não descrevem um negócio, e cada consulta custa.
  if (!placeId && texto.length < 3) {
    return NextResponse.json({ sugestoes: [] });
  }

  const cota = await consumirCota(LIMITES.autocomplete, conta.id);
  if (!cota.permitido) {
    return NextResponse.json({ erro: cota.mensagem }, { status: 429 });
  }

  try {
    if (placeId) {
      return NextResponse.json({
        detalhes: await detalhesDoLugar(placeId, sessao),
      });
    }

    return NextResponse.json({ sugestoes: await sugerirNegocios(texto, sessao) });
  } catch (erro) {
    if (erro instanceof PlacesIndisponivelError) {
      return NextResponse.json({ erro: erro.detalhe }, { status: 503 });
    }
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 },
    );
  }
}
