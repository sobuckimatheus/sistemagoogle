import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/lib/env/client";
import { serverEnv } from "@/lib/env/server";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * No Next 15 `cookies()` é assíncrono, por isso a função é async — chamar sem
 * await devolve uma Promise e a sessão nunca é lida.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components não podem escrever cookie. Isso é esperado:
            // quem renova a sessão é o middleware, então ignorar aqui é
            // seguro — desde que o middleware esteja ativo.
          }
        },
      },
    },
  );
}

/**
 * Cliente com a service role key: ignora RLS e tem poder total no banco.
 *
 * Use apenas em job de background e webhook, onde não existe usuário na
 * requisição. Nunca em caminho que responda a input do usuário sem antes
 * checar a autorização por conta.
 */
export function createSupabaseAdminClient() {
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // sem sessão: este cliente não representa usuário nenhum
        },
      },
    },
  );
}
