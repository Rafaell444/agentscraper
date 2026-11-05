import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Tbilisi Home" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="5 November 2026"
      sections={[
        { head: "What this covers", body: "This policy covers Tbilisi Home: Buy & Rent, our website and mini app, and the internal app our staff use to publish our own listings to our own Facebook, Instagram, Threads and TikTok accounts." },
        { head: "Social media accounts", body: "When our staff connect our agency's social media accounts, we store the access keys those platforms give us, only to publish our own listings. We do not read, collect or store data about other users of those platforms." },
        { head: "Clients", body: "If you contact us or ask for a viewing, we keep the details you send (name, phone or Telegram username, what you are looking for) to answer you and send matching apartments. You can ask us to stop at any time: send /stop to our Telegram bot or write to our manager." },
        { head: "Sharing", body: "We do not sell personal data. Details are shared only with the property owner when you ask us to arrange a viewing or a deal." },
        { head: "Deleting your data", body: "To have your data deleted, write to our manager in Telegram, @Manager_Tbilisi_Home_Buy_Rent. We delete it within 30 days." },
      ]}
    />
  );
}
