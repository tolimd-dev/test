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
    price?: string[]
    date?: string[]
    maxGuests?: string[]
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
  const priceStr = formData.get("price") as string
  const dateStr = formData.get("date") as string
  const maxGuestsStr = formData.get("maxGuests") as string

  const errors: NonNullable<EventState>["errors"] = {}

  if (!title || title.length < 3) errors.title = ["Title must be at least 3 characters."]
  if (!description) errors.description = ["Description is required."]
  if (!menu) errors.menu = ["Menu is required."]

  const price = parseFloat(priceStr)
  if (isNaN(price) || price <= 0) errors.price = ["Please enter a valid price."]

  const date = new Date(dateStr)
  if (!dateStr || isNaN(date.getTime()) || date < new Date()) {
    errors.date = ["Please enter a future date and time."]
  }

  const maxGuests = parseInt(maxGuestsStr)
  if (isNaN(maxGuests) || maxGuests < 1) errors.maxGuests = ["Must allow at least 1 guest."]

  if (Object.keys(errors).length > 0) return { errors }

  const hostId = (session.user as { id?: string }).id!
  const event = await prisma.event.create({
    data: { title, description, menu, price, date, maxGuests, hostId },
  })

  revalidatePath("/")
  revalidatePath("/host/dashboard")
  redirect(`/events/${event.id}`)
}
