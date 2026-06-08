import { prisma } from "@/lib/prisma"
import { HomeHero } from "@/app/components/HomeHero"
import { ExperiencesSection } from "@/app/components/ExperiencesSection"

export default async function HomePage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      host: { select: { name: true } },
      availability: true,
    },
  })

  return (
    <div>
      <HomeHero />
      <ExperiencesSection events={events} />
    </div>
  )
}
