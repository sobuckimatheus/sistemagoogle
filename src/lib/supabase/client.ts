import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";

/**
 * Cliente Supabase para Client Components.
 *
 * Usa a anon key, que é pública por design — quem protege os dados nesse
 * caminho é a RLS do Postgres, não o sigilo da chave.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
