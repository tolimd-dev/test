import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import Link from "next/link"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default async function HomePage() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      host: { select: { name: true } },
      availability: true,
    },
  })

  return (
    <div>
      <section className="bg-amber-700 text-white py-20 px-4 text-center">
        {role === "HOST" ? (
          <>
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
          </>
        ) : (
          <>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Dine with the Chef</h1>
            <p className="text-lg text-amber-100 max-w-xl mx-auto mb-8">
              Cook alongside restaurant owners. Taste the history. Hear the story behind the food.
            </p>
            <Link
              href={role === "PATRON" ? "/" : "/auth/signup"}
              className="inline-block bg-white text-amber-700 font-semibold px-6 py-3 rounded-lg hover:bg-amber-50 transition-colors"
            >
              {role === "PATRON" ? "Browse Experiences" : "Join an Experience"}
            </Link>
          </>
        )}
      </section>

      {role !== "HOST" && (
        <section className="max-w-6xl mx-auto px-4 py-14">
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
      )}
    </div>
  )
}
