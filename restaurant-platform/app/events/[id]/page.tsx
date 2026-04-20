import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { BookingCalendar } from "./BookingCalendar"

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      host: { select: { name: true, bio: true } },
      availability: true,
      sessions: {
        include: { reservations: { select: { guests: true } } },
        where: { date: { gte: new Date() } },
      },
    },
  })

  if (!event) notFound()

  const fromPrice = (event.basePrice / event.maxGuests + event.pricePerPerson).toFixed(2)

  // Serialize sessions for client component
  const sessionData = event.sessions.map(s => ({
    id: s.id,
    date: s.date.toISOString(),
    guestsBooked: s.reservations.reduce((sum, r) => sum + r.guests, 0),
  }))

  const userReservation = user?.id
    ? await prisma.reservation.findFirst({
        where: { userId: user.id, session: { eventId: id } },
        include: { session: true },
      })
    : null

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link href="/" className="text-sm text-amber-700 hover:underline mb-6 inline-block">
        ← All Experiences
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <p className="text-amber-700 font-semibold text-sm uppercase tracking-wide mb-2">
              {event.availability.map(a => DAYS[a.dayOfWeek]).join(" · ")}
              {" · "}
              {Math.floor(event.durationMins / 60)}h{event.durationMins % 60 > 0 ? `${event.durationMins % 60}m` : ""} experience
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{event.title}</h1>
            <p className="text-gray-600 leading-relaxed">{event.description}</p>
          </div>

          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <h2 className="font-bold text-gray-900 mb-3">The Menu</h2>
            <p className="text-gray-700 whitespace-pre-line leading-relaxed">{event.menu}</p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="font-bold text-gray-900 mb-2">Pricing</h2>
            <p className="text-sm text-gray-600">
              Base cost: <span className="font-medium">${event.basePrice.toFixed(2)}</span> (covers the host&apos;s time)
              {" + "}
              <span className="font-medium">${event.pricePerPerson.toFixed(2)}/person</span> for ingredients.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Per-person cost drops as more guests join — from ${(event.basePrice + event.pricePerPerson).toFixed(2)} alone
              to ${fromPrice} when fully booked ({event.maxGuests} guests).
            </p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="font-bold text-gray-900 mb-2">About Your Host</h2>
            <p className="font-medium text-amber-700">{event.host.name}</p>
            {event.host.bio && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{event.host.bio}</p>
            )}
          </div>
        </div>

        {/* Booking card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-stone-200 p-5 sticky top-6">
            <p className="text-xl font-bold text-gray-900 mb-1">
              From ${fromPrice}
              <span className="text-sm font-normal text-gray-500">/person</span>
            </p>
            <p className="text-xs text-gray-400 mb-4">Price decreases as more guests book</p>

            {userReservation ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-green-700 font-semibold">You&apos;re in!</p>
                <p className="text-sm text-green-600 mt-1">
                  {new Date(userReservation.session.date).toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric",
                  })}
                  {" at "}
                  {new Date(userReservation.session.date).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-green-600">{userReservation.guests} guest{userReservation.guests > 1 ? "s" : ""}</p>
              </div>
            ) : !user ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-gray-500">Sign in to pick a date and reserve.</p>
                <Link
                  href="/auth/signin"
                  className="block w-full bg-amber-700 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-800 transition-colors text-center"
                >
                  Sign In
                </Link>
                <Link href="/auth/signup" className="text-sm text-amber-700 hover:underline">
                  Create an account
                </Link>
              </div>
            ) : user.role === "HOST" ? (
              <p className="text-gray-400 text-sm text-center py-2">Host accounts cannot reserve events.</p>
            ) : (
              <BookingCalendar
                eventId={id}
                maxGuests={event.maxGuests}
                basePrice={event.basePrice}
                pricePerPerson={event.pricePerPerson}
                availability={event.availability.map(a => ({
                  dayOfWeek: a.dayOfWeek,
                  startTime: a.startTime,
                }))}
                sessions={sessionData}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
