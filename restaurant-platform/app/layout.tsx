import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { SignOutButton } from "./components/SignOutButton"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

export const metadata: Metadata = {
  title: "TableStory — Dine with the Chef",
  description: "Intimate dining experiences with restaurant owners. Cook, eat, and learn the story behind the food.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user = session?.user as { name?: string; role?: string } | undefined

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-gray-900">
        <Providers>
          <header className="bg-white border-b border-stone-200">
            <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <Link href="/" className="text-xl font-bold text-amber-700 tracking-tight">
                TableStory
              </Link>
              <div className="flex items-center gap-6 text-sm font-medium">
                <Link href="/" className="text-gray-600 hover:text-amber-700 transition-colors">
                  Browse Events
                </Link>
                {!user && (
                  <>
                    <Link href="/auth/signin" className="text-gray-600 hover:text-amber-700 transition-colors">
                      Sign In
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="bg-amber-700 text-white px-4 py-2 rounded-lg hover:bg-amber-800 transition-colors"
                    >
                      Join
                    </Link>
                  </>
                )}
                {user?.role === "HOST" && (
                  <Link href="/host/dashboard" className="text-gray-600 hover:text-amber-700 transition-colors">
                    My Events
                  </Link>
                )}
                {user?.role === "PATRON" && (
                  <Link href="/patron/reservations" className="text-gray-600 hover:text-amber-700 transition-colors">
                    My Reservations
                  </Link>
                )}
                {user && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">Hi, {user.name?.split(" ")[0]}</span>
                    <SignOutButton />
                  </div>
                )}
              </div>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="bg-white border-t border-stone-200 text-center text-sm text-gray-400 py-6">
            © 2026 TableStory — Connecting chefs and curious eaters.
          </footer>
        </Providers>
      </body>
    </html>
  )
}
