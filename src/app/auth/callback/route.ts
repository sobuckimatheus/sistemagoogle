import { NextResponse, type NextRequest } from "next/server";

import { provisionarUsuario } from "@/lib/auth/provisionar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Usa Prisma, que não roda em Edge Runtime.
export const runtime = "nodejs";

/**
 * Destino do link de confirmação de e-mail e do retorno de OAuth.
 *
 * Troca o `code` por sessão e provisiona a estrutura da conta antes de
 * mandar o usuário para dentro do app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const proximo = searchParams.get("proximo") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?erro=${encodeURIComponent("Link inválido ou expirado.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?erro=${encodeURIComponent(
        error?.message ?? "Não foi possível concluir a autenticação.",
      )}`,
    );
  }

  await provisionarUsuario(data.user);

  return NextResponse.redirect(`${origin}${proximo}`);
}
