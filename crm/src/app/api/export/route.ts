import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildOrder, buildWhere, readFilters } from "@/lib/queries";
import { statusLabel } from "@/lib/options";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Site", "Property ID", "Link", "Title", "Deal Type", "Property Type", "Status", "Condition", "District",
  "Neighbourhood", "Address", "Area m2", "Rooms", "Bedrooms", "Floor", "Total Floors", "Price USD", "Price GEL",
  "Price per m2 USD", "Owner Name", "Phone", "Posted", "Collected", "Lead Status", "Agent",
];

function cell(value: unknown): string {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = readFilters(params);
  const rows = await prisma.listing.findMany({
    where: buildWhere(filters),
    orderBy: buildOrder(filters.sort),
    take: 5000,
    include: { lead: { include: { assignedTo: { select: { name: true } } } } },
  });
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.siteName, r.propertyId, r.link, r.title, r.dealType, r.propertyType, r.status, r.condition, r.district,
        r.neighbourhood, r.address, r.areaM2, r.rooms, r.bedrooms, r.floor, r.totalFloors, r.priceUsd, r.priceGel,
        r.pricePerM2Usd, r.ownerName, r.phone, r.postedAt, r.collectedAt, statusLabel(r.lead?.status), r.lead?.assignedTo?.name,
      ]
        .map(cell)
        .join(","),
    );
  }
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="listings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
