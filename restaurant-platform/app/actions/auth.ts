"use server"

import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"

export type SignupState = {
  errors?: {
    name?: string[]
    email?: string[]
    password?: string[]
    role?: string[]
  }
  message?: string
} | undefined

export async function signup(state: SignupState, formData: FormData): Promise<SignupState> {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const role = formData.get("role") as string
  const bio = formData.get("bio") as string

  const errors: NonNullable<SignupState>["errors"] = {}

  if (!name || name.length < 2) errors.name = ["Name must be at least 2 characters."]
  if (!email || !email.includes("@")) errors.email = ["Please enter a valid email."]
  if (!password || password.length < 6) errors.password = ["Password must be at least 6 characters."]
  if (!role || !["HOST", "PATRON"].includes(role)) errors.role = ["Please select a role."]

  if (Object.keys(errors).length > 0) return { errors }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { message: "An account with this email already exists." }

  const hashedPassword = await bcrypt.hash(password, 10)
  await prisma.user.create({
    data: { name, email, password: hashedPassword, role, bio: bio || null },
  })

  redirect("/auth/signin?registered=1")
}
