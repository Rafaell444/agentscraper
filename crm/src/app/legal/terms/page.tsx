import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Terms of Service — Tbilisi Home" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="5 November 2026"
      sections={[
        { head: "Who we are", body: "Tbilisi Home: Buy & Rent is a real estate agency in Tbilisi, Georgia. We publish apartments for rent and sale on our own website, Telegram channels and social media accounts (Facebook, Instagram, Threads, TikTok)." },
        { head: "Our app", body: "Our internal app is used only by our agency staff to publish our own listings to our own social media accounts. It does not post on behalf of other people and is not offered to the public." },
        { head: "Listings", body: "Listing details (price, photos, description) are given in good faith and may change. A listing is not an offer; availability and final terms are confirmed by our agent before any agreement." },
        { head: "Acceptable use", body: "Please do not copy our photos or texts for other listings without permission. Our photos carry our watermark." },
        { head: "Contact", body: "Questions about these terms: write to our manager in Telegram, @Manager_Tbilisi_Home_Buy_Rent." },
      ]}
    />
  );
}
