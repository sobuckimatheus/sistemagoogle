import Link from "next/link";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { accessTokenValido, ConexaoInvalidaError } from "@/lib/google/conexao";
import {
  AllowlistPendenteError,
  listarContas,
  listarLocais,
} from "@/lib/google/locais";
import { prisma } from "@/lib/prisma";

import { FormularioLocais, type LocalSelecionavel } from "./formulario";

export const dynamic = "force-dynamic";

export default async function LocaisPage({
  searchParams,
}: {
  searchParams: Promise<{ conexao?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { conexao: conexaoId } = await searchParams;

  if (!conexaoId) {
    return <Aviso titulo="Conexão não informada" texto="Volte e conecte novamente." />;
  }

  const conexao = await prisma.googleConnection.findFirst({
    where: { id: conexaoId, accountId: conta.id },
  });

  if (!conexao) {
    return <Aviso titulo="Conexão não encontrada" texto="Ela pode ter sido removida." />;
  }

  let token: string;
  try {
    token = await accessTokenValido(conexao.id);
  } catch (erro) {
    if (erro instanceof ConexaoInvalidaError) {
      return (
        <Aviso
          titulo="Conexão inválida"
          texto={`${erro.message} Reconecte para continuar.`}
        />
      );
    }
    throw erro;
  }

  try {
    const contasGbp = await listarContas(token);

    if (contasGbp.length === 0) {
      return (
        <Aviso
          titulo="Nenhum perfil encontrado"
          texto={
            "Esta conta Google não administra nenhum Perfil de Empresa. " +
            "Conecte outra conta, ou peça ao dono do negócio para adicionar " +
            "seu e-mail como gerente do perfil."
          }
        />
      );
    }

    const rastreados = new Set(
      (
        await prisma.business.findMany({
          where: { accountId: conta.id },
          select: { locationName: true },
        })
      ).map((b) => b.locationName),
    );

    const locais: LocalSelecionavel[] = [];
    for (const contaGbp of contasGbp) {
      for (const local of await listarLocais(token, contaGbp.name)) {
        const endereco = [
          local.storefrontAddress?.addressLines?.join(", "),
          local.storefrontAddress?.locality,
          local.storefrontAddress?.administrativeArea,
        ]
          .filter(Boolean)
          .join(" · ");

        locais.push({
          valor: JSON.stringify({
            name: local.name,
            title: local.title,
            placeId: local.metadata?.placeId,
            contaGbp: contaGbp.name,
            categoria: local.categories?.primaryCategory?.displayName,
            telefone: local.phoneNumbers?.primaryPhone,
            site: local.websiteUri,
            cidade: local.storefrontAddress?.locality,
            estado: local.storefrontAddress?.administrativeArea,
          }),
          titulo: local.title,
          endereco: endereco || "endereço não informado",
          categoria: local.categories?.primaryCategory?.displayName ?? null,
          jaRastreado: rastreados.has(local.name),
        });
      }
    }

    const assinatura = await prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    });

    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Escolha os locais
          </h1>
          <p className="text-sm text-neutral-500">
            Selecione quais Perfis de Empresa este painel deve acompanhar.
          </p>
        </header>

        <FormularioLocais
          conexaoId={conexao.id}
          locais={locais}
          maxNegocios={assinatura?.plan.maxBusinesses ?? 1}
          jaRastreados={rastreados.size}
        />
      </main>
    );
  } catch (erro) {
    if (erro instanceof AllowlistPendenteError) {
      return <AllowlistPendente api={erro.api} />;
    }
    throw erro;
  }
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-sm text-neutral-500">{texto}</p>
      <Link href="/conectar" className="text-sm underline">
        Voltar para conexões
      </Link>
    </main>
  );
}

function AllowlistPendente({ api }: { api: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Acesso à API em aprovação</h1>
        <p className="text-sm text-neutral-500">
          A autorização com o Google funcionou, mas a <strong>{api}</strong>{" "}
          ainda respondeu com acesso negado.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 text-sm dark:border-neutral-800">
        <p>
          As Business Profile APIs vêm com cota zero até o Google aprovar um
          pedido de acesso. O prazo costuma ser de 7 a 10 dias úteis, e o
          pedido é por projeto do Google Cloud — mas cada API ainda precisa
          ser ativada individualmente na Biblioteca.
        </p>
        <p className="text-neutral-500">
          A API v4, usada em avaliações e postagens, tem um allowlist separado:
          ela pode continuar negando mesmo depois que esta liberar.
        </p>
      </div>

      <Link href="/" className="text-sm underline">
        Voltar ao início
      </Link>
    </main>
  );
}
