"use client"

import { useActionState } from "react"
import { createEvent } from "@/app/actions/events"
import Link from "next/link"

export default function NewEventPage() {
  const [state, action, pending] = useActionState(createEvent, undefined)

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/host/dashboard" className="text-sm text-amber-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Create a New Event</h1>
        <p className="text-gray-500 mt-1">Share your story. Set your table. Invite the world.</p>
      </div>

      {state?.message && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.message}
        </div>
      )}

      <form action={action} className="space-y-6 bg-white rounded-xl border border-stone-200 p-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Event Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
            placeholder="e.g. An Evening of Sicilian Home Cooking"
          />
          {state?.errors?.title && (
            <p className="mt-1 text-xs text-red-600">{state.errors.title[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 resize-none"
            placeholder="Tell guests what makes this experience special — the story of your food, your family, your culture…"
          />
          {state?.errors?.description && (
            <p className="mt-1 text-xs text-red-600">{state.errors.description[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="menu" className="block text-sm font-medium text-gray-700 mb-1">
            Menu
          </label>
          <textarea
            id="menu"
            name="menu"
            rows={4}
            required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 resize-none"
            placeholder="Arancini · Pasta al Norma · Cannoli — list what you'll cook together and serve"
          />
          {state?.errors?.menu && (
            <p className="mt-1 text-xs text-red-600">{state.errors.menu[0]}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Price per Person ($)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              min="1"
              step="0.01"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="75"
            />
            {state?.errors?.price && (
              <p className="mt-1 text-xs text-red-600">{state.errors.price[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Date & Time
            </label>
            <input
              id="date"
              name="date"
              type="datetime-local"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
            />
            {state?.errors?.date && (
              <p className="mt-1 text-xs text-red-600">{state.errors.date[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="maxGuests" className="block text-sm font-medium text-gray-700 mb-1">
              Max Guests
            </label>
            <input
              id="maxGuests"
              name="maxGuests"
              type="number"
              min="1"
              max="30"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="8"
            />
            {state?.errors?.maxGuests && (
              <p className="mt-1 text-xs text-red-600">{state.errors.maxGuests[0]}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-amber-700 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
        >
          {pending ? "Creating event…" : "Publish Event"}
        </button>
      </form>
    </div>
  )
}
