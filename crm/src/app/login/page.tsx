import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <div className="mx-auto mt-16 max-w-sm sm:mt-24">
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-8 9 8M5 10v10h14V10" />
          </svg>
        </span>
        <span className="text-xl font-bold tracking-tight text-gray-900">მესაკუთრე CRM</span>
      </div>
      <div className="ui-card p-6">
        <h1 className="text-lg font-semibold text-gray-900">შესვლა</h1>
        <p className="mb-5 text-sm text-gray-500">შედით თქვენი აგენტის ანგარიშით</p>
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-gray-400">თბილისის მესაკუთრეთა განცხადებები · ყოველ 30 წუთში</p>
    </div>
  );
}
