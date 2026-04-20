import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function PatronReservationsPage() {
  const session = await auth()
  if (!session?.user || (session.user as { role?: string }).role !== "PATRON") {
    redirect("/auth/signin")
  }

  const userId = (session.user as { id?: string }).id!

  const reservations = await prisma.reservation.findMany({
    where: { userId },
    orderBy: { event: { date: "asc" } },
    include: {
      event: {
        include: { host: { select: { name: true } } },
      },
    },
  })

  const upcoming = reservations.filter((r) => new Date(r.event.date) >= new Date())
  const past = reservations.filter((r) => new Date(r.event.date) < new Date())

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">My Reservations</h1>
      <p className="text-gray-500 mb-10">Your upcoming and past dining experiences</p>

      {reservations.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-stone-200">
          <p className="text-gray-400 text-lg mb-4">You haven&apos;t reserved any events yet.</p>
          <Link
            href="/"
            className="inline-block bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-800 transition-colors"
          >
            Browse Experiences
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((r) => (
                  <ReservationCard key={r.id} reservation={r} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-500 mb-4">Past</h2>
              <div className="space-y-3 opacity-70">
                {past.map((r) => (
                  <ReservationCard key={r.id} reservation={r} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function ReservationCard({
  reservation,
}: {
  reservation: {
    id: string
    guests: number
    event: {
      id: string
      title: string
      date: Date
      price: number
      host: { name: string }
    }
  }
}) {
  const date = new Date(reservation.event.date)
  return (
    <Link
      href={`/events/${reservation.event.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-stone-200 p-5 hover:shadow-sm transition-shadow"
    >
      <div>
        <h3 className="font-bold text-gray-900 mb-1">{reservation.event.title}</h3>
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
        <p className="text-xs text-gray-400 mt-1">Hosted by {reservation.event.host.name}</p>
      </div>
      <div className="text-right">
        <p className="text-amber-700 font-bold">
          ${(reservation.event.price * reservation.guests).toFixed(2)}
        </p>
        <p className="text-sm text-gray-500">{reservation.guests} guest{reservation.guests > 1 ? "s" : ""}</p>
      </div>
    </Link>
  )
}
