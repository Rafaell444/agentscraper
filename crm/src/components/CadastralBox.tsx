import { addressKey } from "@/lib/cadastre";
import { setCadastralCode } from "@/app/cadastre/actions";
import { SubmitButton } from "./SubmitButton";

/** Cadastral code of an address, editable; shared by everything at that address. */
export function CadastralBox({ address, code, back }: { address: string | null | undefined; code: string | null; back: string }) {
  if (!address || !addressKey(address)) {
    return <p className="text-xs text-gray-500">საკადასტრო კოდისთვის მისამართში ქუჩა და ნომერი უნდა იყოს.</p>;
  }
  return (
    <form action={setCadastralCode} className="space-y-1.5">
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="back" value={back} />
      <div className="flex gap-2">
        <input name="code" defaultValue={code ?? ""} placeholder="მაგ. 01.14.12.005.017" className="ui-field min-w-0 flex-1 font-mono" />
        <SubmitButton pending="…" className="ui-btn ui-btn-secondary ui-btn-sm">შენახვა</SubmitButton>
      </div>
      <p className="text-[11px] text-gray-500">
        {code ? "ეს კოდი ჩანს ყველა განცხადებაზე და ბანერზე იგივე მისამართით." : "შენახვის შემდეგ კოდი გამოჩნდება ყველა განცხადებაზე და ბანერზე იგივე ქუჩა/ნომრით."}
      </p>
    </form>
  );
}
