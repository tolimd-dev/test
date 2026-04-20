"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export type EventState = {
  errors?: {
    title?: string[]
    description?: string[]
    menu?: string[]
    basePrice?: string[]
    pricePerPerson?: string[]
    date?: string[]
    maxGuests?: string[]
    availability?: string[]
  }
  message?: string
} | undefined

export async function createEvent(state: EventState, formData: FormData): Promise<EventState> {
  const session = await auth()
  if (!session?.user || (session.user as { role?: string }).role !== "HOST") {
    return { message: "Unauthorized." }
  }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const menu = formData.get("menu") as string
  const basePriceStr = formData.get("basePrice") as string
  const pricePerPersonStr = formData.get("pricePerPerson") as string
  const maxGuestsStr = formData.get("maxGuests") as string
  const durationMinsStr = formData.get("durationMins") as string

  const errors: NonNullable<EventState>["errors"] = {}

  if (!title || title.length < 3) errors.title = ["Title must be at least 3 characters."]
  if (!description) errors.description = ["Description is required."]
  if (!menu) errors.menu = ["Menu is required."]

  const basePrice = parseFloat(basePriceStr)
  if (isNaN(basePrice) || basePrice < 0) errors.basePrice = ["Please enter a valid base price."]

  const pricePerPerson = parseFloat(pricePerPersonStr)
  if (isNaN(pricePerPerson) || pricePerPerson < 0) errors.pricePerPerson = ["Please enter a valid ingredient cost."]

  const maxGuests = parseInt(maxGuestsStr)
  if (isNaN(maxGuests) || maxGuests < 1) errors.maxGuests = ["Must allow at least 1 guest."]

  const durationMins = parseInt(durationMinsStr) || 180

  // Collect availability entries from form (avail_0 through avail_6)
  const availabilityEntries: { dayOfWeek: number; startTime: string }[] = []
  for (let day = 0; day <= 6; day++) {
    const time = formData.get(`avail_${day}`) as string | null
    if (time) availabilityEntries.push({ dayOfWeek: day, startTime: time })
  }

  if (availabilityEntries.length === 0) {
    errors.availability = ["Please set at least one available day."]
  }

  if (Object.keys(errors).length > 0) return { errors }

  const hostId = (session.user as { id?: string }).id!
  const event = await prisma.event.create({
    data: {
      title,
      description,
      menu,
      basePrice,
      pricePerPerson,
      maxGuests,
      durationMins,
      hostId,
      availability: { create: availabilityEntries },
    },
  })

  revalidatePath("/")
  revalidatePath("/host/dashboard")
  redirect(`/events/${event.id}`)
}
