import NextTopLoader from "nextjs-toploader";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const notoThaiLooped = localFont({
  src: [
    {path: "./fonts/noto-sans-thai-looped/NotoSansThaiLooped-400.ttf", weight: "400", style: "normal"},
    {path: "./fonts/noto-sans-thai-looped/NotoSansThaiLooped-500.ttf", weight: "500", style: "normal"},
    {path: "./fonts/noto-sans-thai-looped/NotoSansThaiLooped-600.ttf", weight: "600", style: "normal"},
    {path: "./fonts/noto-sans-thai-looped/NotoSansThaiLooped-700.ttf", weight: "700", style: "normal"},
  ],
  variable: "--font-noto-thai",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "SSO Core — Enterprise Identity & Access Management",
  description: "OAuth 2.0 / OIDC Single Sign-On & Mobile Push 2FA Verification System",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`dark ${notoThaiLooped.variable} ${jetbrainsMono.variable}`}
    >
      <body className="dark min-h-screen bg-[#09090b] font-sans text-[13px] text-zinc-100 antialiased selection:bg-zinc-800 selection:text-white">
        <NextTopLoader color="#a78bfa" height={3} showSpinner={false} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

