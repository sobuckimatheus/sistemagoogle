import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";

import { FormularioParametros, FormularioPerfil } from "./formularios";

export const dynamic = "force-dynamic";

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
        <p className="text-sm text-neutral-500">
          O que você salvar aqui vai direto para o Perfil de Empresa no Google.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Dados públicos</h2>
        <FormularioPerfil
          businessId={negocio.id}
          inicial={{
            title: negocio.title,
            phone: negocio.phone ?? "",
            website: negocio.website ?? "",
            description: negocio.description ?? "",
          }}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Parâmetros das estimativas</h2>
          <p className="text-sm text-neutral-500">
            Estes valores ficam só aqui — não são enviados ao Google.
          </p>
        </div>
        <FormularioParametros
          businessId={negocio.id}
          ticketMedio={negocio.ticketMedio}
          taxaConversao={negocio.taxaConversaoManual}
        />
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5 text-sm dark:border-neutral-800">
        <h2 className="font-medium">Ainda não editável por aqui</h2>
        <p className="text-neutral-500">
          Horários, categorias, serviços e endereço exigem estruturas próprias
          da API e entram em uma etapa seguinte. Enquanto isso, edite esses
          campos direto no Google — o próximo sync traz os valores para cá.
        </p>
      </section>
    </main>
  );
}
