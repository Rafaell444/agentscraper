// Neighbourhood pages of the public website (/area/vake): a short
// description per district and the numbers computed from our listings.

import type { Lang } from "./catalog";
import { placeName } from "./catalog";

type Blurb = Record<Lang, string>;

/** Keys are the Georgian district names used in SharedPost.district. */
export const AREA_INFO: Record<string, Blurb> = {
  "ვაკე": {
    en: "Leafy and central, Vake is one of Tbilisi's most sought-after districts: Vake Park, Chavchavadze Avenue with its cafés and shops, good schools and quick access to the centre.",
    ru: "Зелёный центральный район, один из самых востребованных в Тбилиси: парк Ваке, проспект Чавчавадзе с кафе и магазинами, хорошие школы и близость к центру.",
    ka: "მწვანე და ცენტრალური უბანი, თბილისის ერთ-ერთი ყველაზე მოთხოვნადი: ვაკის პარკი, ჭავჭავაძის გამზირი კაფეებითა და მაღაზიებით, კარგი სკოლები და ცენტრთან სიახლოვე.",
  },
  "საბურთალო": {
    en: "A large, lively residential district with universities, malls and plenty of new buildings, well connected by the second metro line.",
    ru: "Большой оживлённый жилой район с университетами, торговыми центрами и множеством новостроек, удобно связанный второй линией метро.",
    ka: "დიდი, ცოცხალი საცხოვრებელი უბანი უნივერსიტეტებით, სავაჭრო ცენტრებით და ბევრი ახალი შენობით, მეტროს მეორე ხაზით კარგად დაკავშირებული.",
  },
  "ვერა": {
    en: "Old Tbilisi charm close to Rustaveli Avenue: quiet streets, historic houses, small cafés and theatres within walking distance.",
    ru: "Очарование старого Тбилиси рядом с проспектом Руставели: тихие улочки, исторические дома, небольшие кафе и театры в шаговой доступности.",
    ka: "ძველი თბილისის ხიბლი რუსთაველის გამზირთან ახლოს: მშვიდი ქუჩები, ისტორიული სახლები, პატარა კაფეები და თეატრები ფეხით სავალზე.",
  },
  "მთაწმინდა": {
    en: "On the slopes below Mtatsminda Park, with views over the city and the centre a short walk downhill.",
    ru: "На склонах под парком Мтацминда, с видами на город; до центра — короткая прогулка вниз.",
    ka: "მთაწმინდის პარკის ფერდობებზე, ქალაქის ხედებით; ცენტრამდე მოკლე გასეირნებაა.",
  },
  "სოლოლაკი": {
    en: "Historic streets with 19th-century houses and balconies, right next to Freedom Square and Old Tbilisi.",
    ru: "Исторические улицы с домами XIX века и балконами, рядом с площадью Свободы и Старым Тбилиси.",
    ka: "ისტორიული ქუჩები XIX საუკუნის სახლებითა და აივნებით, თავისუფლების მოედანთან და ძველ თბილისთან ახლოს.",
  },
  "ძველი თბილისი": {
    en: "The heart of the city: sulphur baths, Narikala, restaurants and galleries — ideal for short stays and for living among the sights.",
    ru: "Сердце города: серные бани, Нарикала, рестораны и галереи — идеально для коротких поездок и жизни среди достопримечательностей.",
    ka: "ქალაქის გული: გოგირდის აბანოები, ნარიყალა, რესტორნები და გალერეები — იდეალურია მოკლე ვიზიტისთვის და ღირსშესანიშნაობებს შორის ცხოვრებისთვის.",
  },
  "ავლაბარი": {
    en: "Across the river from the old town, around Sameba Cathedral, with its own metro station and fast access to the centre.",
    ru: "На другом берегу от старого города, вокруг собора Самеба, со своей станцией метро и быстрым доступом в центр.",
    ka: "ძველი ქალაქის მოპირდაპირე ნაპირზე, სამების ტაძრის გარშემო, საკუთარი მეტროს სადგურით და ცენტრთან სწრაფი კავშირით.",
  },
  "ჩუღურეთი": {
    en: "A central, characterful district around Aghmashenebeli Avenue, with renovated streets, restaurants and two metro stations.",
    ru: "Центральный колоритный район вокруг проспекта Агмашенебели, с обновлёнными улицами, ресторанами и двумя станциями метро.",
    ka: "ცენტრალური, თავისებური უბანი აღმაშენებლის გამზირის გარშემო, განახლებული ქუჩებით, რესტორნებით და მეტროს ორი სადგურით.",
  },
  "დიდუბე": {
    en: "A practical, well-connected district with metro, the main bus station and markets, popular for good-value rentals.",
    ru: "Практичный район с хорошим транспортом: метро, главный автовокзал и рынки; популярен благодаря доступной аренде.",
    ka: "პრაქტიკული, კარგად დაკავშირებული უბანი მეტროთი, მთავარი ავტოსადგურით და ბაზრებით, პოპულარული ხელმისაწვდომი ქირის გამო.",
  },
  "დიღომი": {
    en: "Newer residential blocks, more space for the money and quick access to the highway and the airport road.",
    ru: "Новые жилые кварталы, больше площади за те же деньги и быстрый выезд на трассу и к аэропорту.",
    ka: "ახალი საცხოვრებელი კვარტლები, იმავე ფასად მეტი ფართი და სწრაფი გასასვლელი მაგისტრალზე და აეროპორტისკენ.",
  },
  "დიდი დიღომი": {
    en: "A green, calm suburb-style district with new complexes, parks and space for families.",
    ru: "Зелёный спокойный район пригородного типа с новыми комплексами, парками и простором для семей.",
    ka: "მწვანე, მშვიდი, გარეუბნის ტიპის უბანი ახალი კომპლექსებით, პარკებით და სივრცით ოჯახებისთვის.",
  },
  "ისანი": {
    en: "On the left bank with good metro links, local markets and affordable flats.",
    ru: "На левом берегу, с хорошим метро, местными рынками и доступными квартирами.",
    ka: "მარცხენა სანაპიროზე, კარგი მეტროთი, ადგილობრივი ბაზრებით და ხელმისაწვდომი ბინებით.",
  },
  "სამგორი": {
    en: "A large residential area on the first metro line, with markets, schools and some of the best prices in the city.",
    ru: "Большой жилой район на первой линии метро, с рынками, школами и одними из лучших цен в городе.",
    ka: "დიდი საცხოვრებელი უბანი მეტროს პირველ ხაზზე, ბაზრებით, სკოლებით და ქალაქში ერთ-ერთი საუკეთესო ფასებით.",
  },
  "ნაძალადევი": {
    en: "A residential district north of the centre, on the first metro line, with markets and everyday services close by.",
    ru: "Жилой район к северу от центра, на первой линии метро, с рынками и всем необходимым рядом.",
    ka: "საცხოვრებელი უბანი ცენტრის ჩრდილოეთით, მეტროს პირველ ხაზზე, ბაზრებითა და ყოველდღიური სერვისებით ახლოს.",
  },
  "გლდანი": {
    en: "The city's northern residential district: large blocks, parks and low prices, at the end of the first metro line.",
    ru: "Северный жилой район города: большие кварталы, парки и низкие цены, конечная первой линии метро.",
    ka: "ქალაქის ჩრდილოეთი საცხოვრებელი უბანი: დიდი კვარტლები, პარკები და დაბალი ფასები, მეტროს პირველი ხაზის ბოლოს.",
  },
  "კრწანისი": {
    en: "Quiet and green, south of the old town, with private houses and new low-rise complexes.",
    ru: "Тихий и зелёный, к югу от старого города, с частными домами и новыми малоэтажными комплексами.",
    ka: "მშვიდი და მწვანე, ძველი ქალაქის სამხრეთით, კერძო სახლებით და ახალი დაბალსართულიანი კომპლექსებით.",
  },
  "ორთაჭალა": {
    en: "By the river south of the centre, with new developments, gardens and quick access to the old town.",
    ru: "У реки к югу от центра, с новыми комплексами, садами и быстрым доступом к старому городу.",
    ka: "მდინარესთან, ცენტრის სამხრეთით, ახალი კომპლექსებით, ბაღებით და ძველ ქალაქთან სწრაფი კავშირით.",
  },
  "ბაგები": {
    en: "Green hills near Vake with fresh air, private houses and calm streets.",
    ru: "Зелёные холмы рядом с Ваке, свежий воздух, частные дома и спокойные улицы.",
    ka: "მწვანე ბორცვები ვაკესთან ახლოს, სუფთა ჰაერი, კერძო სახლები და მშვიდი ქუჩები.",
  },
  "ლისი": {
    en: "Around Lisi Lake: a calm, green area with new complexes, walking paths and family homes.",
    ru: "Вокруг Лисского озера: спокойный зелёный район с новыми комплексами, прогулочными дорожками и домами для семей.",
    ka: "ლისის ტბის გარშემო: მშვიდი, მწვანე უბანი ახალი კომპლექსებით, სასეირნო ბილიკებით და საოჯახო სახლებით.",
  },
  "ვარკეთილი": {
    en: "A residential district at the end of the first metro line, with markets and very affordable flats.",
    ru: "Жилой район на конечной первой линии метро, с рынками и очень доступными квартирами.",
    ka: "საცხოვრებელი უბანი მეტროს პირველი ხაზის ბოლოს, ბაზრებით და ძალიან ხელმისაწვდომი ბინებით.",
  },
};

/** "vake", "old-tbilisi", "didi-dighomi" — from the English name. */
export function areaSlug(district: string): string {
  return placeName(district, "en").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
