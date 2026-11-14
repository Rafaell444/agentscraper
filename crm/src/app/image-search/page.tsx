import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImageSearch } from "./ImageSearch";

export const dynamic = "force-dynamic";

/** Find scraped listings by photo (and the owner's posting with the number). Staff only. */
export default async function ImageSearchPage() {
  await requireUser();
  const [listings, indexed] = await Promise.all([
    prisma.listing.count({ where: { OR: [{ NOT: { image: null } }, { NOT: { images: null } }] } }),
    prisma.listingImageHash.groupBy({ by: ["listingId"] }).then((rows) => rows.length).catch(() => 0),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="ძებნა ფოტოთი"
        subtitle={`ატვირთე ბინის ფოტოები — ვიპოვით იმ განცხადებას, სადაც იგივე ფოტოა, და იმავე ბინის მესაკუთრის პოსტს ნომრით. ფოტოებით ინდექსირებულია ${indexed.toLocaleString("en-US")} / ${listings.toLocaleString("en-US")} განცხადება (ახლები ყოველ გაშვებაზე ემატება).`}
      />
      <ImageSearch />
    </div>
  );
}
