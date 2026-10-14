"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const LISTINGS_QUERY_KEY = "crm.listingsQuery";

/** Remember the current listings filters so other pages can return to them. */
export function rememberListingsQuery(search: string) {
  try {
    sessionStorage.setItem(LISTINGS_QUERY_KEY, search);
  } catch {
    /* storage unavailable (private mode) */
  }
}

function lastListingsHref(): string {
  try {
    const query = sessionStorage.getItem(LISTINGS_QUERY_KEY) ?? "";
    return query ? `/listings${query.startsWith("?") ? query : `?${query}`}` : "/listings";
  } catch {
    return "/listings";
  }
}

/** A link to the listings page that restores the filters the user last used. */
export function ListingsLink({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) {
  const [href, setHref] = useState("/listings");
  useEffect(() => setHref(lastListingsHref()), []);
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
