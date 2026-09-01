import { NextResponse, type NextRequest } from "next/server";

import { contaAtivaOuNulo } from "@/lib/auth/conta";
import {
  detalhesDoLugar,
  PlacesIndisponivelError,
  sugerirNegocios,
} from "@/lib/google/places";
import { consumirCota, ipDaRequisicao, LIMITES } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Autocomplete de negócios e detalhamento do escolhido.
 *
 * Rota, e não Server Action, porque isto responde a cada tecla digitada:
 * Server Actions são enfileiradas em ordem e uma digitação rápida ficaria
 * esperando a anterior terminar.
 *
 * Atende visitante anônimo — a página isca depende disso — mas com limite
 * bem menor. A chave da Places API é cobrada por uso, então um endpoint sem
 * teto seria a conta de outra pessoa pagando a curiosidade de qualquer um.
 */
export async function GET(request: NextRequest) {
  const sessaoAtiva = await contaAtivaOuNulo();

  const { chave, limite } = sessaoAtiva
    ? { chave: sessaoAtiva.conta.id, limite: LIMITES.autocomplete }
    : { chave: ipDaRequisicao(request), limite: LIMITES.autocompleteAnonimo };

  const { searchParams } = request.nextUrl;
  const placeId = searchParams.get("placeId");
  const texto = (searchParams.get("q") ?? "").trim();
  const sessao = searchParams.get("sessao") ?? undefined;

  // Duas teclas ainda não descrevem um negócio, e cada consulta custa.
  if (!placeId && texto.length < 3) {
    return NextResponse.json({ sugestoes: [] });
  }

  const cota = await consumirCota(limite, chave);
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
