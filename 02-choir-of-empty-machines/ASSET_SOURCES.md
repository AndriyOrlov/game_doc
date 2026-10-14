---
type: Asset Sources
title: "Хор порожніх машин"
status: proposal
version: "0.1"
updated: 2026-10-15
---

# Готові ассети і плагіни

Добірка безкоштовних джерел, які закривають позиції з [ASSETS.csv](ASSETS.csv). Рушій ще не затверджено (O001), тому позначено, де ресурс прив’язаний до Unreal. Бюджет 0 (D003): платних позицій тут немає. Правило з [TOOLS](TOOLS.md) діє й тут: SDK чи плагін підключаємо тільки тоді, коли базове рішення рушія показало конкретний дефіцит.

Ціни й умови перевірено 15.10.2026. Перед завантаженням ще раз відкрити сторінку джерела: акції на Fab тимчасові, ліцензії змінюються.

## Куплене або отримане на Fab

**Не перевірено.** Бібліотека fab.com/library потребує входу в акаунт Epic. Після перевірки вписати сюди все, що підходить, і в першу чергу пошукати:

- **Abandoned Cathedral (RagTarock).** 210 модульних мешів зруйнованого собору, UE 5.3–5.6, Nanite і Lumen. Був безкоштовним на Fab до 21.10.2025 ([Digital Production](https://digitalproduction.com/2025/10/10/free-3d-cathedral-kit-lands-on-fab/)). Якщо його тоді забрали, він закриває ART-003 для greybox і блокінгу залу.
- **Ancient Temple Ruins (Rasmus Bagner).** 80 модульних ассетів руїн, UE 5.2+. Був безкоштовним до 13.01.2026 ([CG Channel](https://www.cgchannel.com/?p=173060)). Годиться на кам’яні модулі й зовнішній обхід арени.
- Будь-які Megascans, отримані до 2025 року: вони лишаються доступними за тією ліцензією, яку прийняли тоді.

## Анімація і персонажі

| Ресурс | Для чого | Ціна і ліцензія | Рушій |
| --- | --- | --- | --- |
| [Game Animation Sample Project](https://www.unrealengine.com/blog/game-animation-sample) (Epic) | ART-001: рух Носія. Понад 500 анімацій, motion matching, готовий Animation Blueprint | Безкоштовно | Unreal |
| [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) (Adobe) | ART-001, ART-005: мілі-атаки, ухилення, реакції на удар; манекени X Bot і Y Bot для блокінгу | Безкоштовно з Adobe ID, royalty-free для ігор | Будь-який (FBX) |
| [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) (Quaternius) | ART-001: мілі-комбо на 3–4 удари, sword dash, slide; скелет ретаргетиться з Mixamo | CC0, ціну ставиш сам; 42 анімації безкоштовно | Будь-який (GLB, .blend) |
| [Send to Unreal і UE to Rigify](https://github.com/poly-hammer/BlenderTools) | Пайплайн Blender → Unreal для Носія, облич і рук боса | MIT, спільнотний форк інструментів Epic | Blender + Unreal |

## Бос, архітектура і матеріали

| Ресурс | Для чого | Ціна і ліцензія | Рушій |
| --- | --- | --- | --- |
| [Smithsonian Open Access, 3D Voyager](https://www.si.edu/openaccess) | ART-002, ART-007: скани масок і скульптур як основа керамічних облич | CC0 | Будь-який |
| [Poly Haven](https://polyhaven.com) і [ambientCG](https://ambientcg.com) | ART-003, ART-004: кераміка, мідь, камінь, HDRI | CC0 | Будь-який |
| PCG Framework | ART-003: процедурні ряди органних труб, кільця колон, ярусні балкони | Вбудовано в Unreal | Unreal |
| Niagara | ART-008: снаряди, кільця, телеграфи | Вбудовано в Unreal | Unreal |
| [Fab Limited-Time Free](https://forums.unrealengine.com/t/fab-limited-time-free-content/2738884) | Нові безкоштовні ассети кожні два тижні. Добірка 6–20.10.2026 нам не підходить | Безкоштовно лише у вікні акції | Переважно Unreal |

Megascans більше не безкоштовні для Unreal: нові ассети на Fab продаються поштучно або за підпискою ([StraySpark](https://www.strayspark.studio/blog/quixel-to-fab-migration-indie-developer-survival-guide-2026)).

## Логіка гри

| Ресурс | Для чого | Ціна і ліцензія | Рушій |
| --- | --- | --- | --- |
| [FlowGraph](https://github.com/MothCocoon/FlowGraph) | Сценарні прапорці демо (`first_voice_taken`, `choir_intro_seen` тощо), порядок катсцен CS01–CS04 | MIT | Unreal 5 |
| [Logic Driver Lite](https://www.fab.com/listings/a3e2fc1f-2aaa-49a1-bc26-4d5d38f7d82f) | Скінченний автомат фаз Трьох облич і станів героя | Lite безкоштовна, Pro платна | Unreal |
| Gameplay Ability System, Enhanced Input, CommonUI | Удар, ухилення, відбиття, партія; перепризначення клавіш; HUD для ПК і сенсорного вводу | Вбудовано в Unreal | Unreal |

## Звук і музика

| Ресурс | Для чого | Ціна і ліцензія | Рушій |
| --- | --- | --- | --- |
| [Quartz](https://dev.epicgames.com/documentation/en-us/unreal-engine/quartz-overview-in-unreal-engine) | AUD-005: єдиний транспорт 96 BPM, вирівнювання атак і переходів фаз до такту з точністю до семпла | Вбудовано в Unreal | Unreal |
| MetaSounds | AUD-001…005: процедурні голоси, удари, шари музики за фазами | Вбудовано в Unreal | Unreal |
| [Steam Audio](https://github.com/ValveSoftware/steam-audio) | AUD-004: HRTF, відбиття і реверберація залу | Apache 2.0 | Unreal 4.27+ |
| [Wwise](https://www.audiokinetic.com/en/blog/free-wwise-indie-license) | Кандидат middleware, якщо нативного міксу забракне | Безкоштовно при бюджеті гри до $250 000, без ліміту ассетів | Unreal, Unity, Godot |
| [FMOD Studio](https://www.gamedeveloper.com/audio/small-developers-and-creators-can-now-use-fmod-studio-for-free) | Те саме, альтернатива Wwise | Безкоштовно при річному доході до $200 000 і бюджеті до $500 000 (умови 2020 року, звірити на fmod.com/legal) | Unreal, Unity |
| [Sonniss GDC 2026 Game Audio Bundle](https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/) | AUD-001…004: понад 7,47 ГБ ефектів (метал, механізми, простори) | Royalty-free, без атрибуції | Будь-який |
| [Spitfire LABS: Choir](https://www.audiotechnology.com/free-stuff/labs-choir) і [Pipe Organ](https://sonicstate.com/amped/2021/03/08/free-pipe-organ-instrument) | AUD-005: хор і орган для музичних шарів | Безкоштовно; музика для ігор royalty-free, заборонено робити з них власні бібліотеки семплів ([умови](https://support.spitfireaudio.com/en/articles/11815239-are-spitfire-audio-sample-libraries-royalty-free-and-can-i-use-them-on-commercial-recordings)) | DAW (VST/AU) |

## Порядок підключення

1. **Зараз, без витрат часу на інтеграцію:** перевірити бібліотеку Fab, скачати Sonniss і LABS, підібрати CC0-матеріали.
2. **Етап 0 (звук і transport):** Quartz + MetaSounds. Steam Audio — тільки якщо нативна реверберація не дає залу.
3. **Етап 1 (бій на 5–10 хв):** GASP або Mixamo для руху й атак, Logic Driver Lite для фаз боса.
4. **Етап 2 (еталонна арена):** PCG для труб і ярусів, скани облич зі Smithsonian як основа, FlowGraph для сценарних станів.
5. Wwise чи FMOD — лише після того, як Етап 0 покаже конкретну проблему нативного рішення.
