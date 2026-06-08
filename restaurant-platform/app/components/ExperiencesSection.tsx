"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type EventCard = {
  id: string
  title: string
  description: string
  basePrice: number
  pricePerPerson: number
  maxGuests: number
  host: { name: string }
  availability: { dayOfWeek: number }[]
}

export function ExperiencesSection({ events }: { events: EventCard[] }) {
  const { data: session, status } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const loading = status === "loading"

  if (loading) return null

  if (role === "HOST") {
    return (
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="text-center py-20 bg-white rounded-xl border border-stone-200">
          <h2 className="text-xl font-bold text-gray-900 mb-2">This is the patron view</h2>
          <p className="text-gray-400 mb-6">Host accounts manage experiences from the dashboard instead of browsing them.</p>
          <Link
            href="/host/dashboard"
            className="inline-block bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-800 transition-colors"
          >
            Go to My Dashboard
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section id="experiences" className="max-w-6xl mx-auto px-4 py-14">
      <h2 className="text-2xl font-bold text-gray-800 mb-8">Experiences</h2>

      {events.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">No experiences yet.</p>
          <p className="mt-2">
            Are you a restaurant owner?{" "}
            <Link href="/auth/signup" className="text-amber-700 underline">
              Host your first event.
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => {
            const fromPrice = (event.basePrice / event.maxGuests + event.pricePerPerson).toFixed(2)
            const availDays = event.availability.map(a => DAYS[a.dayOfWeek]).join(" · ")
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="bg-white rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="bg-amber-700 h-2" />
                <div className="p-5">
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">
                    {availDays || "Flexible schedule"}
                  </p>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{event.title}</h3>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{event.description}</p>
                  <p className="text-xs text-gray-400 mb-4">Hosted by {event.host.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700 font-bold">From ${fromPrice}/person</span>
                    <span className="text-xs text-gray-400">up to {event.maxGuests} guests</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
