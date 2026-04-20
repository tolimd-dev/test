"use client"

import { useActionState } from "react"
import { signup } from "@/app/actions/auth"
import Link from "next/link"

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined)

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
        <p className="text-gray-500 mb-8">
          Already have one?{" "}
          <Link href="/auth/signin" className="text-amber-700 font-medium hover:underline">
            Sign in
          </Link>
        </p>

        {state?.message && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {state.message}
          </div>
        )}

        <form action={action} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="Julia Child"
            />
            {state?.errors?.name && (
              <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="julia@restaurant.com"
            />
            {state?.errors?.email && (
              <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="At least 6 characters"
            />
            {state?.errors?.password && (
              <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I am a…</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 border border-stone-300 rounded-lg p-3 cursor-pointer hover:border-amber-500 has-[:checked]:border-amber-600 has-[:checked]:bg-amber-50">
                <input type="radio" name="role" value="PATRON" defaultChecked className="accent-amber-700" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Food Lover</p>
                  <p className="text-xs text-gray-500">Reserve experiences</p>
                </div>
              </label>
              <label className="flex items-center gap-3 border border-stone-300 rounded-lg p-3 cursor-pointer hover:border-amber-500 has-[:checked]:border-amber-600 has-[:checked]:bg-amber-50">
                <input type="radio" name="role" value="HOST" className="accent-amber-700" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Restaurant Owner</p>
                  <p className="text-xs text-gray-500">Host events</p>
                </div>
              </label>
            </div>
            {state?.errors?.role && (
              <p className="mt-1 text-xs text-red-600">{state.errors.role[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
              Bio <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 resize-none"
              placeholder="Tell us a little about yourself or your restaurant…"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-amber-700 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
          >
            {pending ? "Creating account…" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  )
}
