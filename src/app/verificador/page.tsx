import { PaginaIsca } from "@/components/isca";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verificador de Posição no Google — grátis | Painel GBP",
  description:
    "Descubra em que posição sua empresa aparece no Google Maps para o serviço que você vende. Grátis, sem cadastro.",
};

/**
 * Mesma página da raiz, em endereço próprio.
 *
 * Existe para campanhas e links diretos poderem apontar para um endereço
 * estável, e para quem já está logado conseguir abrir a isca — a raiz, nesse
 * caso, mostra o painel.
 */
export default function VerificadorPage() {
  return <PaginaIsca />;
}
