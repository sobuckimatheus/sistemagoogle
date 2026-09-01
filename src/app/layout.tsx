import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";

import "./globals.css";

/**
 * Duas famílias, dois papéis.
 *
 * Instrument Sans carrega a interface e os números; Instrument Serif aparece
 * uma vez por tela, na frase que o painel quer que o dono do negócio leia
 * devagar. Serifa em todo lugar viraria enfeite — usada só ali, vira ênfase.
 */
const sans = Instrument_Sans({
  variable: "--fonte-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--fonte-serif",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lumora",
  description:
    "Gestão e otimização de Perfil de Empresa no Google para negócios locais e agências.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
