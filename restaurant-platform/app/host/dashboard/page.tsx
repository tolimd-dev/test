import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default async function HostDashboard() {
  const session = await auth()
  if (!session?.user || (session.user as { role?: string }).role !== "HOST") {
    redirect("/auth/signin")
  }

  const hostId = (session.user as { id?: string }).id!

  const events = await prisma.event.findMany({
    where: { hostId },
    orderBy: { createdAt: "desc" },
    include: {
      availability: true,
      sessions: {
        where: { date: { gte: new Date() } },
        include: { reservations: { select: { guests: true } } },
        orderBy: { date: "asc" },
        take: 1,
      },
    },
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Experiences</h1>
          <p className="text-gray-500 mt-1">Manage your dining experiences</p>
        </div>
        <Link
          href="/host/events/new"
          className="bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-800 transition-colors"
        >
          + New Experience
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-stone-200">
          <p className="text-gray-400 text-lg mb-4">You haven&apos;t created any experiences yet.</p>
          <Link
            href="/host/events/new"
            className="inline-block bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-800 transition-colors"
          >
            Create Your First Experience
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const availDays = event.availability.map(a => DAYS[a.dayOfWeek]).join(", ")
            const nextSession = event.sessions[0]
            const nextGuests = nextSession?.reservations.reduce((s, r) => s + r.guests, 0) ?? 0
            const fromPrice = (event.basePrice / event.maxGuests + event.pricePerPerson).toFixed(2)

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{event.title}</h3>
                  <p className="text-sm text-gray-500">Available: {availDays || "No schedule set"}</p>
                  {nextSession ? (
                    <p className="text-sm text-amber-700 mt-1">
                      Next booking:{" "}
                      {new Date(nextSession.date).toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                      {" · "}
                      {nextGuests}/{event.maxGuests} guests
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">No upcoming bookings yet</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-amber-700 font-bold">From ${fromPrice}/person</p>
                  <p className="text-sm text-gray-400">up to {event.maxGuests} guests</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
