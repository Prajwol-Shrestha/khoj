import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://khoj.shresthaprajwol.com.np";
const TITLE = "khoj — document retrieval engine";
const DESCRIPTION =
  "Upload a PDF and ask questions in plain language. khoj retrieves the most relevant passages and answers strictly from them — every response cites the exact chunks it used.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — khoj",
  },
  description: DESCRIPTION,
  keywords: [
    "PDF question answering",
    "document retrieval",
    "RAG",
    "retrieval augmented generation",
    "chat with PDF",
    "document search",
  ],
  applicationName: "khoj",
  authors: [{ name: "Prajwol Shrestha" }],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "khoj",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "khoj",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "productivity",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-void text-ink">
        {children}
      </body>
    </html>
  );
}
