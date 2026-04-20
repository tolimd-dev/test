import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ReserveForm } from "./ReserveForm"

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      host: { select: { name: true, bio: true } },
      reservations: { select: { guests: true } },
    },
  })

  if (!event) notFound()

  const guestsBooked = event.reservations.reduce((sum, r) => sum + r.guests, 0)
  const spotsLeft = event.maxGuests - guestsBooked
  const date = new Date(event.date)
  const isPast = date < new Date()

  let userReservation = null
  if (user?.id) {
    userReservation = await prisma.reservation.findUnique({
      where: { eventId_userId: { eventId: id, userId: user.id } },
    })
  }

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
              {date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {" · "}
              {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{event.title}</h1>
            <p className="text-gray-600 leading-relaxed">{event.description}</p>
          </div>

          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <h2 className="font-bold text-gray-900 mb-3">The Menu</h2>
            <p className="text-gray-700 whitespace-pre-line leading-relaxed">{event.menu}</p>
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
          <div className="bg-white rounded-xl border border-stone-200 p-6 sticky top-6">
            <p className="text-2xl font-bold text-gray-900 mb-1">
              ${event.price.toFixed(2)}
              <span className="text-base font-normal text-gray-500"> / person</span>
            </p>

            <div className="text-sm text-gray-500 mb-4 space-y-1">
              <p>
                {spotsLeft > 0 ? (
                  <span className="text-green-700 font-medium">{spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</span>
                ) : (
                  <span className="text-red-600 font-medium">Fully booked</span>
                )}
                {" "}of {event.maxGuests} total
              </p>
            </div>

            {isPast ? (
              <p className="text-gray-400 text-sm text-center py-2">This event has already taken place.</p>
            ) : userReservation ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-green-700 font-semibold">You&apos;re in!</p>
                <p className="text-sm text-green-600 mt-1">
                  {userReservation.guests} guest{userReservation.guests > 1 ? "s" : ""} reserved
                </p>
              </div>
            ) : !user ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-gray-500">Sign in to reserve your spot.</p>
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
            ) : spotsLeft > 0 ? (
              <ReserveForm eventId={id} maxGuests={spotsLeft} pricePerPerson={event.price} />
            ) : (
              <p className="text-red-500 text-sm text-center py-2">This event is fully booked.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
