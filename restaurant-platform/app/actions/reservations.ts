"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export type ReserveState = {
  message?: string
  success?: boolean
} | undefined

export async function createReservation(
  eventId: string,
  state: ReserveState,
  formData: FormData
): Promise<ReserveState> {
  const session = await auth()
  if (!session?.user) return { message: "Please sign in to make a reservation." }
  if ((session.user as { role?: string }).role === "HOST") {
    return { message: "Host accounts cannot make reservations." }
  }

  const userId = (session.user as { id?: string }).id!
  const guestsStr = formData.get("guests") as string
  const guests = parseInt(guestsStr) || 1

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { _count: { select: { reservations: true } } },
  })

  if (!event) return { message: "Event not found." }

  const totalReserved = await prisma.reservation.aggregate({
    where: { eventId },
    _sum: { guests: true },
  })

  const spotsLeft = event.maxGuests - (totalReserved._sum.guests ?? 0)
  if (guests > spotsLeft) {
    return { message: `Only ${spotsLeft} spot(s) remaining.` }
  }

  const existing = await prisma.reservation.findUnique({
    where: { eventId_userId: { eventId, userId } },
  })
  if (existing) return { message: "You already have a reservation for this event." }

  await prisma.reservation.create({ data: { eventId, userId, guests } })

  revalidatePath(`/events/${eventId}`)
  revalidatePath("/patron/reservations")

  return { success: true, message: "Reservation confirmed!" }
}
