# Single source of truth / Revision policy

Кожен основний документ має **один чинний шлях**: `GDD.md`, `LEVEL_DESIGN.md`, `NARRATIVE.md`, `ART_DIRECTION.md` та інші. Файли типу `LEVEL_DESIGN_V02.md` у робочому каталозі заборонені.

1. Нова редакція **замінює вміст основного файлу**; нова нумерація версії пишеться в його metadata/header.
2. Перед заміною попередню редакцію можна зберегти в `archive/YYYY-MM-DD/` або покластися на Git history. Архів не є джерелом правди.
3. Якщо оновлена концепція **замінює стару**, у тому самому commit змінюємо GDD, LD, ART_DIRECTION, README, маніфест, ігрові кадри та посилання, які посилаються на старий вибір.
4. Авторські gameplay-кадри живуть у `references/gameplay/`; середовища у `references/environments/`; персонажі у `references/characters/`; кіти у `references/modular/`. Усі поточні зображення індексує `references/GENERATION_MANIFEST.md`.
5. Зовнішні copyrighted references існують як посилання і розбір «що запозичуємо як принцип» у `refs/`. Не комітити чужі кадри без прав.
6. Після кожного push перевіряти наявність нових файлів і відсутність застарілих посилань.

Поточний документ для Choir of Empty Machines: `02-choir-of-empty-machines/LEVEL_DESIGN.md`.
