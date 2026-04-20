"use client"

import { useActionState } from "react"
import { createReservation } from "@/app/actions/reservations"
import { useState } from "react"

export function ReserveForm({
  eventId,
  maxGuests,
  pricePerPerson,
}: {
  eventId: string
  maxGuests: number
  pricePerPerson: number
}) {
  const [guests, setGuests] = useState(1)
  const boundAction = createReservation.bind(null, eventId)
  const [state, action, pending] = useActionState(boundAction, undefined)

  return (
    <form action={action} className="space-y-4">
      {state?.message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            state.success
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <div>
        <label htmlFor="guests" className="block text-sm font-medium text-gray-700 mb-1">
          Number of guests
        </label>
        <select
          id="guests"
          name="guests"
          value={guests}
          onChange={(e) => setGuests(parseInt(e.target.value))}
          className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 bg-white"
        >
          {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
      </div>

      <div className="text-sm text-gray-500 flex justify-between">
        <span>Total</span>
        <span className="font-semibold text-gray-900">${(guests * pricePerPerson).toFixed(2)}</span>
      </div>

      {!state?.success && (
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-amber-700 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
        >
          {pending ? "Reserving…" : "Reserve My Spot"}
        </button>
      )}
    </form>
  )
}
