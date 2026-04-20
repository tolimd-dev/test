"use client"

import { useState, useActionState } from "react"
import { createReservation } from "@/app/actions/reservations"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"]

type AvailabilityEntry = { dayOfWeek: number; startTime: string }
type SessionData = { id: string; date: string; guestsBooked: number }

export function BookingCalendar({
  eventId, maxGuests, basePrice, pricePerPerson, availability, sessions,
}: {
  eventId: string
  maxGuests: number
  basePrice: number
  pricePerPerson: number
  availability: AvailabilityEntry[]
  sessions: SessionData[]
}) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<{ dateTime: string; guestsBooked: number } | null>(null)
  const [state, action, pending] = useActionState(createReservation, undefined)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const availDays = new Set(availability.map(a => a.dayOfWeek))

  const sessionMap = new Map(sessions.map(s => {
    const d = new Date(s.date)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`
    return [key, s]
  }))

  function isDaySelectable(day: number) {
    const d = new Date(year, month, day)
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return d >= startOfToday && availDays.has(d.getDay())
  }

  function getSlotsForDay(day: number) {
    const d = new Date(year, month, day)
    const dow = d.getDay()
    return availability
      .filter(a => a.dayOfWeek === dow)
      .map(a => {
        const [h, m] = a.startTime.split(":").map(Number)
        const slotDate = new Date(year, month, day, h, m)
        const key = `${year}-${month}-${day}-${h}-${m}`
        const session = sessionMap.get(key)
        const guestsBooked = session?.guestsBooked ?? 0
        return {
          time: a.startTime,
          dateTime: slotDate.toISOString(),
          sessionId: session?.id,
          guestsBooked,
          spotsLeft: maxGuests - guestsBooked,
        }
      })
  }

  function formatTime(t: string) {
    const [h, m] = t.split(":").map(Number)
    const period = h >= 12 ? "PM" : "AM"
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${period}`
  }

  function calcPerPerson(guestsBooked: number, newGuests: number) {
    const total = basePrice + pricePerPerson * (guestsBooked + newGuests)
    return (total / (guestsBooked + newGuests)).toFixed(2)
  }

  const isPrevDisabled = year === today.getFullYear() && month === today.getMonth()
  const slots = selectedDay ? getSlotsForDay(selectedDay) : []

  return (
    <div className="space-y-5">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setViewDate(new Date(year, month - 1, 1)); setSelectedDay(null); setSelectedSlot(null) }}
          disabled={isPrevDisabled}
          className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 text-gray-600"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-900">{MONTH_LABELS[month]} {year}</span>
        <button
          onClick={() => { setViewDate(new Date(year, month + 1, 1)); setSelectedDay(null); setSelectedSlot(null) }}
          className="p-2 rounded-lg hover:bg-stone-100 text-gray-600"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 font-medium">
        {DAY_LABELS.map(d => <div key={d}>{d}</div>)}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const selectable = isDaySelectable(day)
          const isSelected = selectedDay === day
          return (
            <button
              key={day}
              onClick={() => { if (!selectable) return; setSelectedDay(isSelected ? null : day); setSelectedSlot(null) }}
              className={`
                aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition-colors
                ${!selectable ? "text-gray-300 cursor-default" : ""}
                ${selectable && !isSelected ? "bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer" : ""}
                ${isSelected ? "bg-amber-700 text-white" : ""}
              `}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Available times:</p>
          {slots.filter(s => s.spotsLeft > 0).length === 0 ? (
            <p className="text-sm text-gray-400">No spots left for this day.</p>
          ) : (
            <div className="space-y-2">
              {slots.filter(s => s.spotsLeft > 0).map(slot => (
                <button
                  key={slot.time}
                  onClick={() => setSelectedSlot(
                    selectedSlot?.dateTime === slot.dateTime ? null :
                      { dateTime: slot.dateTime, guestsBooked: slot.guestsBooked }
                  )}
                  className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    selectedSlot?.dateTime === slot.dateTime
                      ? "border-amber-600 bg-amber-50"
                      : "border-stone-200 hover:border-amber-400"
                  }`}
                >
                  <span className="font-medium">{formatTime(slot.time)}</span>
                  <span className="text-gray-300 mx-2">·</span>
                  <span className="text-green-700">{slot.spotsLeft} spot{slot.spotsLeft !== 1 ? "s" : ""} left</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking form */}
      {selectedSlot && (
        <form action={action} className="space-y-3 pt-4 border-t border-stone-200">
          {state?.message && (
            <div className={`p-3 rounded-lg text-sm ${
              state.success
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {state.message}
            </div>
          )}
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="dateTime" value={selectedSlot.dateTime} />

          <GuestsSelector
            maxSpots={maxGuests - selectedSlot.guestsBooked}
            basePrice={basePrice}
            pricePerPerson={pricePerPerson}
            guestsBooked={selectedSlot.guestsBooked}
            calcPerPerson={calcPerPerson}
          />

          {!state?.success && (
            <button
              type="submit" disabled={pending}
              className="w-full bg-amber-700 text-white font-semibold py-3 rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-60"
            >
              {pending ? "Reserving…" : "Reserve My Spot"}
            </button>
          )}
        </form>
      )}
    </div>
  )
}

function GuestsSelector({ maxSpots, basePrice, pricePerPerson, guestsBooked, calcPerPerson }: {
  maxSpots: number
  basePrice: number
  pricePerPerson: number
  guestsBooked: number
  calcPerPerson: (booked: number, newGuests: number) => string
}) {
  const [guests, setGuests] = useState(1)
  const perPerson = calcPerPerson(guestsBooked, guests)
  const myTotal = (parseFloat(perPerson) * guests).toFixed(2)

  return (
    <>
      <div>
        <label htmlFor="guests" className="block text-sm font-medium text-gray-700 mb-1">
          Number of guests
        </label>
        <select
          id="guests" name="guests" value={guests}
          onChange={e => setGuests(parseInt(e.target.value))}
          className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white text-gray-900"
        >
          {Array.from({ length: maxSpots }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
          ))}
        </select>
      </div>
      <div className="bg-stone-50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between text-gray-500">
          <span>${perPerson}/person × {guests}</span>
          <span>${myTotal}</span>
        </div>
        <div className="flex justify-between font-semibold text-gray-900 border-t border-stone-200 pt-1 mt-1">
          <span>Your total</span>
          <span>${myTotal}</span>
        </div>
        <p className="text-xs text-gray-400 pt-1">Price per person drops as more guests join the same session</p>
      </div>
    </>
  )
}
