import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";

const inter = Inter({
  subsets: ['latin'],
});
export const metadata: Metadata = {
  title: "Smart Home Loans",
  description: "Smart Home Loans is an intelligent, agentic conversational assistant designed to provide personalized support and guidance to home loan applicants. It leverages advanced AI capabilities to understand user queries, provide real-time assistance, and streamline the home loan application process. With a focus on user-centric design, Smart Home Loans aims to enhance the customer experience by offering tailored advice, answering questions, and guiding users through each step of their home loan journey.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased`}
    >
      <body className={`${inter.className} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}
