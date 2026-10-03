# BMW M5 F90 — City Drive

Браузерная аркадная гонка на **three.js**: открытый город, погоня-камера, дрифт, полноэкранный режим.
Работает без установки, прямо в браузере.

### ▶ Играть: https://pashawilliams.github.io/m5-f90-city-drive/

## Управление
| клавиша | действие |
|---|---|
| `W` / `S` | газ / тормоз (на месте — задний ход) |
| `A` / `D` | руль |
| `Space` | ручник (дрифт) |
| `C` | камера: погоня / капот / бампер / кино |
| `Tab` | карта |
| `Esc` | пауза и меню |
| `F` | полноэкранный режим |

## Автомобили
`BMW M5 F90` (процедурная модель с перекрашиваемым кузовом) · `Ferrari 458` ·
`Hypercar GT` · `Endurance LMP` · `Wedge 80s` · `Rally Raid` · `Streamliner`

## Технологии
three.js, PBR-материалы, HDR-окружение, каскадные тени, bloom, SMAA,
процедурный город с инстансингом, физика автомобиля с подвеской и моделью шин.

Если на слабом компьютере подтормаживает — в меню выберите качество «среднее» или «низкое».

## Локальный запуск
```bash
git clone https://github.com/Pashawilliams/m5-f90-city-drive.git
cd m5-f90-city-drive
python -m http.server 8080
```
Открыть http://localhost:8080/ — просто двойным кликом по `index.html` не заработает:
браузер запрещает загрузку ассетов по `file://`.

## История
Версия на Babylon.js + Havok осталась в истории репозитория (тег `babylon-v4`),
но из-за тяжёлого рендера была откатена обратно на three.js.

## Лицензии ассетов
* Модели концепт-каров — [collect-cars](https://github.com/drcollect/collect-cars), CC BY 4.0
* Текстуры — [ambientCG](https://ambientcg.com), CC0 · HDR-небо — [Poly Haven](https://polyhaven.com), CC0
* three.js — MIT
