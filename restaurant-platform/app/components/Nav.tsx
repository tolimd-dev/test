"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"

export function Nav() {
  const { data: session, status } = useSession()
  const user = session?.user as { name?: string; role?: string } | undefined
  const loading = status === "loading"

  return (
    <header className="bg-white border-b border-stone-200">
      <nav className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-amber-700 tracking-tight">
          TableStory
        </Link>
        <div className="flex items-center gap-6 text-sm font-medium">
          {user?.role !== "HOST" && (
            <Link href="/" className="text-gray-600 hover:text-amber-700 transition-colors">
              Browse Experiences
            </Link>
          )}
          {!loading && !user && (
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
            <Link href="/host/dashboard" className="bg-amber-700 text-white px-4 py-2 rounded-lg hover:bg-amber-800 transition-colors">
              My Dashboard
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
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-gray-500 hover:text-amber-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
