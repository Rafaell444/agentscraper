import type { Prisma } from "@prisma/client";

/** Public listing collections for a target group, reachable without login (QR code). */
export type Segment = {
  slug: string;
  title: string; // Georgian, for the CRM
  titleEn: string; // for the public page
  descriptionEn: string;
  dealTypes: string[];
  districts: string[];
  neighbourhoods: string[];
  maxPriceUsd?: number;
};

export const SEGMENTS: Segment[] = [
  {
    slug: "indian",
    title: "ინდოელი მდგმურები",
    titleEn: "Apartments for rent — Indian community",
    descriptionEn: "Long-term rentals in Samgori, Varketili, 300 Aragveli, Isani and nearby. We help you view and sign; owners are verified.",
    dealTypes: ["ქირავდება"],
    districts: ["ისანი-სამგორი"],
    neighbourhoods: ["სამგორი", "ვარკეთილი", "ისანი", "ვაზისუბანი", "ნავთლუღი", "მესამე მასივი", "ორხევი", "ლილო", "აეროპორტის დასახლება", "დამპალოს დასახლება"],
    maxPriceUsd: 1200,
  },
];

export function segmentBySlug(slug: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}

export function segmentWhere(segment: Segment): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    archived: false,
    dealType: { in: segment.dealTypes },
    OR: [{ district: { in: segment.districts } }, { neighbourhood: { in: segment.neighbourhoods } }],
    AND: [{ OR: [{ lead: null }, { lead: { hidden: false } }] }],
  };
  if (segment.maxPriceUsd) where.priceUsd = { lte: segment.maxPriceUsd };
  return where;
}

export const EN_DEAL: Record<string, string> = {
  "ქირავდება": "For rent",
  "ქირავდება დღიურად": "Daily rent",
  "იყიდება": "For sale",
  "გირავდება": "Mortgage",
};
export const EN_TYPE: Record<string, string> = {
  "ბინა": "Apartment",
  "კერძო სახლი": "House",
  "აგარაკი": "Country house",
  "კომერციული ფართი": "Commercial",
  "მიწის ნაკვეთი": "Land",
  "სასტუმრო": "Hotel",
};
export const EN_PLACE: Record<string, string> = {
  "სამგორი": "Samgori",
  "ვარკეთილი": "Varketili",
  "ისანი": "Isani",
  "ვაზისუბანი": "Vazisubani",
  "ნავთლუღი": "Navtlughi",
  "მესამე მასივი": "Third Massive (Samgori)",
  "ორხევი": "Orkhevi",
  "ლილო": "Lilo",
  "აეროპორტის დასახლება": "Airport settlement",
  "დამპალოს დასახლება": "Dampalo",
  "ისანი-სამგორი": "Isani-Samgori",
  "საბურთალო": "Saburtalo",
  "ვაკე": "Vake",
  "დიდუბე": "Didube",
  "გლდანი": "Gldani",
  "ნაძალადევი": "Nadzaladevi",
  "ჩუღურეთი": "Chugureti",
  "მთაწმინდა": "Mtatsminda",
  "სოლოლაკი": "Sololaki",
  "ავლაბარი": "Avlabari",
  "დიდი დიღომი": "Didi Dighomi",
  "დიღომი 1-9": "Dighomi 1-9",
  "ვაშლიჯვარი": "Vashlijvari",
  "თბილისი": "Tbilisi",
};

export const EN_CONDITION: Record<string, string> = {
  "ახალი გარემონტებული": "Newly renovated",
  "გარემონტებული": "Renovated",
  "ძველი გარემონტებული": "Older renovation",
  "ევრორემონტი": "Euro renovation",
  "მიმდინარე რემონტი": "Under renovation",
  "სარემონტო": "Needs renovation",
  "გასარემონტებელი": "Needs renovation",
  "თეთრი კარკასი": "White frame",
  "შავი კარკასი": "Black frame",
  "მწვანე კარკასი": "Green frame",
  "ახალი აშენებული": "New building",
  "ძველი აშენებული": "Old building",
  "მშენებარე": "Under construction",
};

export function en(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "";
  return map[value] ?? value;
}
