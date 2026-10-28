export const BANNER_DEALS = ["იყიდება", "ქირავდება", "ქირავდება დღიურად", "გირავდება"];
export const BANNER_TYPES = ["ბინა", "კერძო სახლი", "კომერციული ფართი", "მიწის ნაკვეთი", "აგარაკი", "სასტუმრო"];
export const BANNER_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "ახალი", cls: "bg-sky-100 text-sky-800" },
  called: { label: "დავურეკე", cls: "bg-amber-100 text-amber-800" },
  interested: { label: "დაინტერესდა", cls: "bg-emerald-100 text-emerald-800" },
  listed: { label: "ავიღეთ", cls: "bg-violet-100 text-violet-800" },
  rejected: { label: "უარი", cls: "bg-gray-200 text-gray-600" },
};
