import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"
import { Nav } from "./components/Nav"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

export const metadata: Metadata = {
  title: "TableStory — Dine with the Chef",
  description: "Intimate dining experiences with restaurant owners. Cook, eat, and learn the story behind the food.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-gray-900">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="bg-white border-t border-stone-200 text-center text-sm text-gray-400 py-6">
            © 2026 TableStory — Connecting chefs and curious eaters.
          </footer>
        </Providers>
      </body>
    </html>
  )
}
