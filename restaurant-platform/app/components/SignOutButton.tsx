"use client"

import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-gray-500 hover:text-amber-700 transition-colors"
    >
      Sign Out
    </button>
  )
}
