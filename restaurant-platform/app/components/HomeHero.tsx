"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"

export function HomeHero() {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const loading = status === "loading"

  if (loading) return <section className="bg-amber-700 py-20 px-4" />

  if (role === "HOST") {
    return (
      <section className="bg-amber-700 text-white py-20 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Welcome Back, Chef</h1>
        <p className="text-lg text-amber-100 max-w-xl mx-auto mb-8">
          Manage your experiences, view upcoming bookings, and create new events.
        </p>
        <Link
          href="/host/dashboard"
          className="inline-block bg-white text-amber-700 font-semibold px-6 py-3 rounded-lg hover:bg-amber-50 transition-colors"
        >
          Go to My Dashboard
        </Link>
      </section>
    )
  }

  if (role === "PATRON") {
    return (
      <section className="bg-amber-700 text-white py-20 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Dine with the Chef</h1>
        <p className="text-lg text-amber-100 max-w-xl mx-auto mb-8">
          Cook alongside restaurant owners. Taste the history. Hear the story behind the food.
        </p>
        <Link
          href="#experiences"
          className="inline-block bg-white text-amber-700 font-semibold px-6 py-3 rounded-lg hover:bg-amber-50 transition-colors"
        >
          Browse Experiences
        </Link>
      </section>
    )
  }

  return (
    <section className="bg-amber-700 text-white py-20 px-4 text-center">
      <h1 className="text-4xl md:text-5xl font-bold mb-4">Dine with the Chef</h1>
      <p className="text-lg text-amber-100 max-w-xl mx-auto mb-8">
        Cook alongside restaurant owners. Taste the history. Hear the story behind the food.
      </p>
      <Link
        href="/auth/signup"
        className="inline-block bg-white text-amber-700 font-semibold px-6 py-3 rounded-lg hover:bg-amber-50 transition-colors"
      >
        Join an Experience
      </Link>
    </section>
  )
}
