"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export type ReserveState = {
  message?: string
  success?: boolean
} | undefined

export async function createReservation(state: ReserveState, formData: FormData): Promise<ReserveState> {
  const session = await auth()
  if (!session?.user) return { message: "Please sign in to make a reservation." }
  if ((session.user as { role?: string }).role === "HOST") {
    return { message: "Host accounts cannot make reservations." }
  }

  const userId = (session.user as { id?: string }).id!
  const eventId = formData.get("eventId") as string
  const dateTimeStr = formData.get("dateTime") as string
  const guests = parseInt(formData.get("guests") as string) || 1

  if (!eventId || !dateTimeStr) return { message: "Invalid booking details." }

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return { message: "Event not found." }

  const date = new Date(dateTimeStr)

  // Find or create session for this timeslot
  let eventSession = await prisma.eventSession.findUnique({
    where: { eventId_date: { eventId, date } },
  })

  if (!eventSession) {
    eventSession = await prisma.eventSession.create({
      data: { eventId, date },
    })
  }

  // Check spots
  const booked = await prisma.reservation.aggregate({
    where: { sessionId: eventSession.id },
    _sum: { guests: true },
  })
  const spotsLeft = event.maxGuests - (booked._sum.guests ?? 0)

  if (guests > spotsLeft) return { message: `Only ${spotsLeft} spot(s) remaining.` }

  const existing = await prisma.reservation.findUnique({
    where: { sessionId_userId: { sessionId: eventSession.id, userId } },
  })
  if (existing) return { message: "You already have a reservation for this time slot." }

  await prisma.reservation.create({
    data: { sessionId: eventSession.id, userId, guests },
  })

  revalidatePath(`/events/${eventId}`)
  revalidatePath("/patron/reservations")

  return { success: true, message: "Reservation confirmed!" }
}
