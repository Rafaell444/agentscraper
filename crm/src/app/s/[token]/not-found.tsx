/** Wrong, archived or hidden post link: say so without pointing anywhere else. */
export default function SharedPostNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="text-lg font-semibold text-gray-800">ბმული აღარ არის აქტიური</div>
      <div className="mt-1 text-sm text-gray-500">This link is no longer active · Ссылка больше не активна</div>
      <div className="mt-3 text-xs text-gray-400">დაუკავშირდით აგენტს, ვინც ბმული გამოგიგზავნათ.</div>
    </div>
  );
}
