import { prisma } from "@/lib/prisma"
import Link from "next/link"

export default async function HomePage() {
  const events = await prisma.event.findMany({
    where: { date: { gte: new Date() } },
    orderBy: { date: "asc" },
    include: {
      host: { select: { name: true } },
    },
  })

  const spotsMap = await Promise.all(
    events.map(async (e) => {
      const agg = await prisma.reservation.aggregate({
        where: { eventId: e.id },
        _sum: { guests: true },
      })
      return { id: e.id, spotsLeft: e.maxGuests - (agg._sum.guests ?? 0) }
    })
  )
  const spotsByEvent = Object.fromEntries(spotsMap.map((s) => [s.id, s.spotsLeft]))

  return (
    <div>
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

      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">Upcoming Experiences</h2>

        {events.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No events yet.</p>
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
              const spots = spotsByEvent[event.id] ?? 0
              const date = new Date(event.date)
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="bg-white rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-shadow overflow-hidden"
                >
                  <div className="bg-amber-700 h-2" />
                  <div className="p-5">
                    <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">
                      {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{event.title}</h3>
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{event.description}</p>
                    <p className="text-xs text-gray-400 mb-4">Hosted by {event.host.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-700 font-bold">${event.price.toFixed(2)} / person</span>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          spots > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {spots > 0 ? `${spots} spot${spots === 1 ? "" : "s"} left` : "Full"}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
