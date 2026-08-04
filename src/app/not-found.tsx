import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-24">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-neutral-500">
        O endereço não existe ou o recurso não pertence à conta selecionada.
      </p>
      <Link href="/" className="text-sm underline">
        Voltar ao início
      </Link>
    </main>
  );
}
