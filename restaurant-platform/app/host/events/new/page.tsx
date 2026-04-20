"use client"

import { useActionState, useState } from "react"
import { createEvent } from "@/app/actions/events"
import Link from "next/link"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default function NewEventPage() {
  const [state, action, pending] = useActionState(createEvent, undefined)
  const [availability, setAvailability] = useState<{ [day: number]: string }>({})

  function toggleDay(day: number) {
    if (availability[day] !== undefined) {
      const next = { ...availability }
      delete next[day]
      setAvailability(next)
    } else {
      setAvailability({ ...availability, [day]: "18:00" })
    }
  }

  function setTime(day: number, time: string) {
    setAvailability({ ...availability, [day]: time })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/host/dashboard" className="text-sm text-amber-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Create a New Experience</h1>
        <p className="text-gray-500 mt-1">Share your story. Set your table. Invite the world.</p>
      </div>

      {state?.message && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.message}
        </div>
      )}

      <form action={action} className="space-y-6 bg-white rounded-xl border border-stone-200 p-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Experience Title
          </label>
          <input
            id="title" name="title" type="text" required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
            placeholder="e.g. An Evening of Sicilian Home Cooking"
          />
          {state?.errors?.title && <p className="mt-1 text-xs text-red-600">{state.errors.title[0]}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description" name="description" rows={4} required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 resize-none"
            placeholder="Tell guests what makes this experience special…"
          />
          {state?.errors?.description && <p className="mt-1 text-xs text-red-600">{state.errors.description[0]}</p>}
        </div>

        {/* Menu */}
        <div>
          <label htmlFor="menu" className="block text-sm font-medium text-gray-700 mb-1">
            Menu
          </label>
          <textarea
            id="menu" name="menu" rows={3} required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 resize-none"
            placeholder="List what you'll cook and serve together…"
          />
          {state?.errors?.menu && <p className="mt-1 text-xs text-red-600">{state.errors.menu[0]}</p>}
        </div>

        {/* Pricing */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Pricing</h3>
          <p className="text-xs text-gray-400 mb-3">
            Base price covers your time. Ingredient cost per person covers food. As more guests join, the per-person cost drops.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="basePrice" className="block text-sm font-medium text-gray-700 mb-1">
                Base price ($)
              </label>
              <input
                id="basePrice" name="basePrice" type="number" min="0" step="0.01" required
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
                placeholder="e.g. 100"
              />
              {state?.errors?.basePrice && <p className="mt-1 text-xs text-red-600">{state.errors.basePrice[0]}</p>}
            </div>
            <div>
              <label htmlFor="pricePerPerson" className="block text-sm font-medium text-gray-700 mb-1">
                Ingredient cost / person ($)
              </label>
              <input
                id="pricePerPerson" name="pricePerPerson" type="number" min="0" step="0.01" required
                className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
                placeholder="e.g. 25"
              />
              {state?.errors?.pricePerPerson && <p className="mt-1 text-xs text-red-600">{state.errors.pricePerPerson[0]}</p>}
            </div>
          </div>
        </div>

        {/* Guests + Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxGuests" className="block text-sm font-medium text-gray-700 mb-1">
              Max guests
            </label>
            <input
              id="maxGuests" name="maxGuests" type="number" min="1" max="30" required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
              placeholder="e.g. 8"
            />
            {state?.errors?.maxGuests && <p className="mt-1 text-xs text-red-600">{state.errors.maxGuests[0]}</p>}
          </div>
          <div>
            <label htmlFor="durationMins" className="block text-sm font-medium text-gray-700 mb-1">
              Event duration
            </label>
            <select
              id="durationMins" name="durationMins"
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 bg-white"
            >
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="150">2.5 hours</option>
              <option value="180" selected>3 hours</option>
              <option value="210">3.5 hours</option>
              <option value="240">4 hours</option>
            </select>
          </div>
        </div>

        {/* Availability */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Your Availability</h3>
          <p className="text-xs text-gray-400 mb-3">
            Check the days you&apos;re available and set a start time. Guests will pick from these slots.
          </p>
          {state?.errors?.availability && (
            <p className="mb-2 text-xs text-red-600">{state.errors.availability[0]}</p>
          )}
          <div className="space-y-2">
            {DAYS.map((dayName, day) => (
              <div key={day} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-32 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availability[day] !== undefined}
                    onChange={() => toggleDay(day)}
                    className="accent-amber-700"
                  />
                  <span className="text-sm text-gray-700">{dayName}</span>
                </label>
                {availability[day] !== undefined && (
                  <>
                    <input
                      type="time"
                      value={availability[day]}
                      onChange={e => setTime(day, e.target.value)}
                      className="px-3 py-1.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900"
                    />
                    <input type="hidden" name={`avail_${day}`} value={availability[day]} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit" disabled={pending}
          className="w-full bg-amber-700 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
        >
          {pending ? "Creating experience…" : "Publish Experience"}
        </button>
      </form>
    </div>
  )
}
