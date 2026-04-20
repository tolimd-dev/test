import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function HostDashboard() {
  const session = await auth()
  if (!session?.user || (session.user as { role?: string }).role !== "HOST") {
    redirect("/auth/signin")
  }

  const hostId = (session.user as { id?: string }).id!

  const events = await prisma.event.findMany({
    where: { hostId },
    orderBy: { date: "asc" },
    include: { _count: { select: { reservations: true } } },
  })

  const spotsMap = await Promise.all(
    events.map(async (e) => {
      const agg = await prisma.reservation.aggregate({
        where: { eventId: e.id },
        _sum: { guests: true },
      })
      return { id: e.id, guestsBooked: agg._sum.guests ?? 0 }
    })
  )
  const guestsByEvent = Object.fromEntries(spotsMap.map((s) => [s.id, s.guestsBooked]))

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Events</h1>
          <p className="text-gray-500 mt-1">Manage your dining experiences</p>
        </div>
        <Link
          href="/host/events/new"
          className="bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-800 transition-colors"
        >
          + New Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-stone-200">
          <p className="text-gray-400 text-lg mb-4">You haven&apos;t hosted any events yet.</p>
          <Link
            href="/host/events/new"
            className="inline-block bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-800 transition-colors"
          >
            Create Your First Event
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const date = new Date(event.date)
            const booked = guestsByEvent[event.id] ?? 0
            const isPast = date < new Date()
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900">{event.title}</h3>
                    {isPast && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Past</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" at "}
                    {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-amber-700 font-bold">${event.price.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">
                    {booked} / {event.maxGuests} guests
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
