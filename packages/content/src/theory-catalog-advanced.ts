import type { TheoryArticle } from "@mentor/shared";

export const advancedTheoryArticles: TheoryArticle[] = [
  {
    id: "theory-js-event-delegation",
    version: 1,
    topic: "javascript",
    slug: "javascript-event-delegation",
    title: "Делегирование событий без хрупких обработчиков",
    summary:
      "Всплытие позволяет одному обработчику на контейнере обслуживать существующие и будущие дочерние элементы. Надёжная реализация различает target и currentTarget, находит ближайшее действие и проверяет границы контейнера.",
    estimatedMinutes: 8,
    relatedContentIds: [
      "js-event-delegation-008",
      "browser-event-phases-002",
      "browser-event-order-006",
    ],
    sections: [
      {
        heading: "Путь события и один обработчик вместо множества",
        paragraphs: [
          "DOM-событие проходит фазу захвата к целевому элементу, достигает target и для большинства пользовательских событий всплывает обратно по дереву. Обработчик контейнера может увидеть клик по любому вложенному элементу и определить намерение по исходной цели.",
          "event.target обозначает элемент, на котором событие возникло, а event.currentTarget — элемент с выполняемым сейчас обработчиком. При делегировании currentTarget обычно является контейнером, поэтому действие ищут от target вверх через closest.",
        ],
        example: {
          title: "Действия динамического списка проектов",
          language: "javascript",
          code: `const projectList = document.querySelector(".project-list");
if (!projectList) throw new Error("Project list was not found");

projectList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const action = event.target.closest("button[data-action]");
  if (!action || !projectList.contains(action)) return;

  const project = action.closest("[data-project-id]");
  if (!project) return;

  const detail = {
    action: action.dataset.action,
    projectId: project.dataset.projectId,
  };
  projectList.dispatchEvent(new CustomEvent("project-action", { detail }));
});`,
          explanation:
            "Клик может прийти от иконки внутри кнопки, поэтому closest поднимается к элементу с data-action. Проверка contains не позволяет случайно обработать подходящий элемент за пределами списка.",
        },
      },
      {
        heading: "Границы приёмника и остановка распространения",
        paragraphs: [
          "Делегирование особенно удобно для списков, чьи элементы добавляются после регистрации обработчика. Новый потомок автоматически участвует в том же маршруте события, и для него не требуется отдельная подписка или ручное снятие listener.",
          "stopPropagation следует применять только при реальном конфликте поведения: он лишает вышестоящие компоненты возможности наблюдать событие. Кроме того, не все события всплывают одинаково, а Shadow DOM может менять видимый путь, поэтому механизм события нужно проверять до выбора делегирования.",
        ],
      },
    ],
    keyPoints: [
      "target остаётся исходной целью события, а currentTarget указывает на текущий обработчик.",
      "closest вместе с проверкой границы контейнера делает делегирование устойчивым к вложенной разметке.",
      "Делегирование обслуживает динамических потомков, но требует понимания всплытия конкретного события.",
    ],
    sourceIds: ["hackfrontend:javascript/event-delegation"],
    references: [
      {
        label: "Hack Frontend — делегирование событий",
        url: "https://www.hackfrontend.com/ru/docs/javascript/event-delegation",
        kind: "topic-source",
      },
      {
        label: "MDN Learn — Event bubbling and delegation",
        url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-ts-conditional-types",
    version: 1,
    topic: "typescript",
    slug: "typescript-conditional-types",
    title: "Conditional types и извлечение связанного типа",
    summary:
      "Conditional type выбирает результирующий тип по отношению assignability, а infer извлекает часть проверяемой структуры. Вместе они позволяют описывать точные производные контракты без ручного перечисления вариантов.",
    estimatedMinutes: 9,
    relatedContentIds: ["ts-conditional-type-006", "ts-never-exhaustive-004"],
    sections: [
      {
        heading: "Условие над типами и локальный infer",
        paragraphs: [
          "Запись T extends U ? X : Y проверяет, совместим ли T с U, и выбирает одну из двух ветвей. Это вычисление происходит на уровне типов и не добавляет runtime-проверку в скомпилированный JavaScript.",
          "Ключевое слово infer объявляет временный type-параметр внутри истинной ветви. Его удобно использовать, когда важна не вся структура целиком, а тип результата функции, элемента коллекции или поля вложенного контракта.",
        ],
        example: {
          title: "Ответ API зависит от выбранного маршрута",
          language: "typescript",
          code: `type EndpointMap = {
  "/profile": { response: { id: string; name: string } };
  "/progress": { response: { completed: number; total: number } };
};

type ResponseOf<Path extends keyof EndpointMap> =
  EndpointMap[Path] extends { response: infer Result }
    ? Result
    : never;

async function request<Path extends keyof EndpointMap>(
  path: Path,
): Promise<ResponseOf<Path>> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json() as Promise<ResponseOf<Path>>;
}

const profile = await request("/profile");
// profile: { id: string; name: string }`,
          explanation:
            "Path сохраняет конкретный ключ, а conditional type извлекает response соответствующего маршрута. Assertion остаётся на границе непроверенного JSON и не заменяет runtime-валидацию ответа.",
        },
      },
      {
        heading: "Распределение по union и роль never",
        paragraphs: [
          "Если слева от extends находится голый type-параметр, условие распределяется по каждому члену union. Результаты затем снова объединяются, что удобно для фильтрации: неподходящая ветвь возвращает never и исчезает из итогового union.",
          "Когда union нужно проверить целиком, обе стороны условия оборачивают в одноэлементные tuple: [T] extends [U]. Сложные вложенные условия быстро ухудшают сообщения об ошибках, поэтому важные преобразования лучше называть и проверять отдельными type-тестами.",
        ],
      },
    ],
    keyPoints: [
      "Conditional type выбирает тип статически и не создаёт условную конструкцию во время выполнения.",
      "infer извлекает связанную часть структуры только в области истинной ветви условия.",
      "Голый type-параметр распределяет условие по union, а tuple-обёртка отключает распределение.",
    ],
    sourceIds: ["hackfrontend:typescript/conditional-types"],
    references: [
      {
        label: "Hack Frontend — conditional types",
        url: "https://www.hackfrontend.com/ru/docs/typescript/conditional-types",
        kind: "topic-source",
      },
      {
        label: "TypeScript Handbook — Conditional Types",
        url: "https://www.typescriptlang.org/docs/handbook/2/conditional-types.html",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-react-context",
    version: 1,
    topic: "react",
    slug: "react-context-boundaries",
    title: "React Context: границы данных и стоимость обновления",
    summary:
      "Context передаёт значение через промежуточные уровни дерева без prop drilling. Предсказуемый provider, строгий custom hook и разделение часто меняющихся данных сохраняют контракт понятным и ограничивают лишние обновления.",
    estimatedMinutes: 9,
    relatedContentIds: ["react-state-ownership-008", "react-memoization-005"],
    sections: [
      {
        heading: "Ближайший provider определяет значение",
        paragraphs: [
          "useContext читает значение ближайшего соответствующего provider выше текущего компонента. Промежуточные компоненты не обязаны принимать и пересылать эти данные, а вложенный provider может переопределить значение только для собственного поддерева.",
          "Полезно хранить null как значение по умолчанию и проверять его в custom hook. Тогда компонент, случайно оказавшийся вне provider, получает раннюю понятную ошибку вместо неявной работы с фиктивным глобальным значением.",
        ],
        example: {
          title: "Типизированный provider темы с обязательной границей",
          language: "tsx",
          code: `import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ThemeMode = "light" | "dark";
type ThemeValue = { mode: ThemeMode; toggle: () => void };

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const value = useMemo<ThemeValue>(() => ({
    mode,
    toggle: () => setMode((current) => current === "light" ? "dark" : "light"),
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme requires ThemeProvider");
  return value;
}`,
          explanation:
            "Custom hook централизует проверку provider. useMemo сохраняет объект value между рендерами без изменения mode, хотя само по себе это не отменяет обновление потребителей при реальной смене темы.",
        },
      },
      {
        heading: "Когда Context помогает, а когда скрывает зависимости",
        paragraphs: [
          "Context подходит данным, которые действительно принадлежат целому поддереву: теме, локали, текущей учётной записи или внедрённому сервису. Обычные props остаются прозрачнее для локальной связи родителя с несколькими непосредственными потомками.",
          "При изменении value React обновляет компоненты, читающие этот context. Большой объект с независимыми часто меняющимися полями расширяет область обновления, поэтому state и actions иногда разделяют по разным contexts или переносят provider ближе к реальным потребителям.",
        ],
      },
    ],
    keyPoints: [
      "Потребитель читает значение ближайшего provider, а не единственное глобальное значение приложения.",
      "Custom hook с проверкой null делает обязательную границу provider частью контракта компонента.",
      "Разделение независимых contexts ограничивает область обновления часто меняющихся данных.",
    ],
    sourceIds: ["hackfrontend:react/react-context-usecontext"],
    references: [
      {
        label: "Hack Frontend — Context и useContext",
        url: "https://www.hackfrontend.com/ru/docs/react/react-context-usecontext",
        kind: "topic-source",
      },
      {
        label: "React documentation — Passing Data Deeply with Context",
        url: "https://react.dev/learn/passing-data-deeply-with-context",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-browser-critical-rendering-path",
    version: 1,
    topic: "browser",
    slug: "browser-critical-rendering-path",
    title: "Critical rendering path: от байтов до первого кадра",
    summary:
      "Первый видимый кадр зависит от загрузки критических ресурсов, построения DOM и CSSOM, расчёта геометрии и отрисовки. Управление приоритетами помогает ускорить экран, но требует понимать зависимости, а не просто добавлять preload.",
    estimatedMinutes: 9,
    relatedContentIds: ["browser-rendering-pipeline-008"],
    sections: [
      {
        heading: "Какие зависимости задерживают первый рендер",
        paragraphs: [
          "Браузер получает HTML и постепенно строит DOM. CSS преобразуется в CSSOM; вместе эти структуры дают браузеру информацию о видимых узлах и применённых стилях, после чего рассчитывается layout и формируется изображение кадра.",
          "Обычный stylesheet участвует в рендер-блокирующем пути, а синхронный script может остановить HTML parser. Модульный script по умолчанию выполняется после разбора документа, но его сеть и выполнение всё равно конкурируют за процессор и пропускную способность.",
        ],
        example: {
          title: "Явные приоритеты ресурсов первого экрана",
          language: "html",
          code: `<head>
  <link
    rel="preload"
    href="/fonts/interface.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
  <link rel="stylesheet" href="/styles/critical.css" />
  <script type="module" src="/app.js"></script>
</head>
<body>
  <img
    src="/images/mentor-hero.avif"
    alt=""
    width="1280"
    height="720"
    fetchpriority="high"
  />
</body>`,
          explanation:
            "Размеры изображения резервируют геометрию, а preload сообщает о действительно критичном шрифте до его обнаружения в CSS. crossorigin должен совпадать с режимом последующего запроса шрифта, иначе ресурс загрузится повторно.",
        },
      },
      {
        heading: "Оптимизация по измерениям, а не по количеству подсказок",
        paragraphs: [
          "Preload повышает приоритет, но не уменьшает размер ресурса. Если пометить критическим всё подряд, действительно важные файлы будут конкурировать с второстепенными. Сначала нужно определить ресурс, который задерживает нужный пользовательский результат, и проверить изменение в waterfall и метриках.",
          "После первого кадра изменения размеров могут повторно запускать layout, а перерисовка затрагивает paint и compositing. Зарезервированные размеры медиа, компактный критический CSS и отложенная загрузка невидимого контента уменьшают работу, но каждую оптимизацию следует подтверждать профилированием.",
        ],
      },
    ],
    keyPoints: [
      "Первый кадр требует критических данных DOM, стилей и геометрии, а не только загрузки HTML.",
      "Render-blocking и parser-blocking описывают разные зависимости в пути обработки страницы.",
      "Preload полезен только для заранее известного критического ресурса и может навредить при избытке.",
    ],
    sourceIds: ["hackfrontend:general-questions/critical-rendering-path"],
    references: [
      {
        label: "Hack Frontend — critical rendering path",
        url: "https://www.hackfrontend.com/ru/docs/general-questions/critical-rendering-path",
        kind: "topic-source",
      },
      {
        label: "MDN Performance Guide — Critical rendering path",
        url: "https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-node-memory-management",
    version: 1,
    topic: "node",
    slug: "node-memory-and-garbage-collection",
    title: "Память Node.js: heap, внешние буферы и удержанные ссылки",
    summary:
      "Сборщик мусора освобождает недостижимые объекты, но не умеет угадать, что достижимая запись в бесконечном кэше больше не нужна приложению. Наблюдение за heap, RSS и external помогает отличить рабочий рост от утечки.",
    estimatedMinutes: 9,
    relatedContentIds: ["node-stream-backpressure-001", "node-buffer-purpose-004"],
    sections: [
      {
        heading: "Достижимость важнее фактической полезности",
        paragraphs: [
          "V8 хранит JavaScript-объекты в управляемом heap и периодически находит недостижимые значения. Пока на объект существует путь от корня — например, из глобального Map, активного таймера или listener — сборщик обязан считать его живым, даже если бизнес-логика больше его не использует.",
          "process.memoryUsage разделяет несколько показателей. heapUsed отражает занятую часть V8 heap, external включает память C++-объектов, связанных с JavaScript, а RSS показывает резидентную память всего процесса и поэтому обычно заметно больше heapUsed.",
        ],
        example: {
          title: "Ограниченный кэш и наблюдаемый снимок памяти",
          language: "javascript",
          code: `class RecentResponses {
  #values = new Map();

  constructor(limit = 100) {
    this.limit = limit;
  }

  set(key, value) {
    this.#values.delete(key);
    this.#values.set(key, value);

    if (this.#values.size > this.limit) {
      const oldestKey = this.#values.keys().next().value;
      this.#values.delete(oldestKey);
    }
  }
}

function memorySnapshot() {
  const { rss, heapUsed, external } = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  return { rssMb: mb(rss), heapMb: mb(heapUsed), externalMb: mb(external) };
}`,
          explanation:
            "Map имеет явную верхнюю границу, поэтому старые ссылки удаляются независимо от активности сборщика. Снимок показывает разные области памяти; единичное значение не доказывает утечку, важен устойчивый тренд при повторяемой нагрузке.",
        },
      },
      {
        heading: "Диагностика начинается с воспроизводимого роста",
        paragraphs: [
          "Увеличение heap само по себе нормально: V8 расширяет пространство и выполняет сборки не после каждого освобождения ссылки. Подозрение возникает, когда после одинаковых циклов нагрузки используемая память стабилизируется всё выше и не возвращается к близкому уровню после полных сборок.",
          "Heap snapshot и allocation profile помогают найти типы объектов и цепочки удержания. Увеличение --max-old-space-size может отсрочить падение процесса, но не устраняет бесконечную коллекцию, забытый listener или очередь без backpressure; сначала исправляют владельца ссылок и их время жизни.",
        ],
      },
    ],
    keyPoints: [
      "Сборщик освобождает недостижимые объекты, а логически устаревшая, но достижимая запись остаётся в памяти.",
      "heapUsed, external и RSS описывают разные части памяти процесса и должны анализироваться раздельно.",
      "Утечку подтверждает повторяемый восходящий тренд и цепочка удержания, а не один высокий снимок.",
    ],
    sourceIds: ["hackfrontend:javascript/garbage-collector"],
    references: [
      {
        label: "Hack Frontend — garbage collector",
        url: "https://www.hackfrontend.com/ru/docs/javascript/garbage-collector",
        kind: "topic-source",
      },
      {
        label: "Node.js Learn — Understanding and Tuning Memory",
        url: "https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-css-cascade-specificity",
    version: 1,
    topic: "css",
    slug: "css-cascade-and-specificity",
    title: "CSS cascade и specificity без войны селекторов",
    summary:
      "Победившее CSS-объявление определяется не одной specificity: сначала учитываются происхождение, importance и cascade layers, затем вес селектора и порядок. Управляемые слои и низкий базовый вес делают переопределения предсказуемыми.",
    estimatedMinutes: 9,
    relatedContentIds: ["css-specificity-002", "css-cascade-layer-006"],
    sections: [
      {
        heading: "Specificity участвует не первой",
        paragraphs: [
          "Cascade собирает подходящие объявления и сравнивает их контекст: origin и importance, порядок cascade layers, затем specificity и порядок появления при равенстве. Поэтому селектор с большим весом не обязательно победит правило из более приоритетного слоя.",
          "Specificity обычно считают по группам ID, классов вместе с атрибутами и псевдоклассами, затем типов и псевдоэлементов. Псевдокласс :where всегда добавляет нулевой вес, позволяя описать структурный контекст без повышения стоимости будущего переопределения.",
        ],
        example: {
          title: "Компоненты с осознанно переопределяемым слоем",
          language: "css",
          code: `@layer reset, components, utilities;

@layer components {
  :where(.profile-card) .profile-card__title {
    color: var(--title-color, #172033);
    font-size: 1.25rem;
  }
}

@layer utilities {
  .text-accent {
    color: #125cff;
  }
}

/* <h2 class="profile-card__title text-accent">...</h2> */`,
          explanation:
            "Позднее объявленный utilities имеет больший приоритет среди обычных author layers, поэтому утилита меняет цвет без !important. :where не добавляет вес .profile-card, и базовый компонент остаётся легко расширяемым.",
        },
      },
      {
        heading: "Наследование и локальный контракт компонента",
        paragraphs: [
          "Наследуемое значение используется только когда для элемента не найдено собственное объявление свойства. Даже правило с низкой specificity, нацеленное непосредственно на элемент, имеет преимущество перед унаследованным цветом от родителя.",
          "Рост цепочек селекторов и !important обычно сигнализирует о неясной архитектуре слоёв. Компонентные классы, custom properties для разрешённых настроек и заранее объявленный порядок layers дают более стабильный контракт, чем попытка каждый раз превысить чужой вес.",
        ],
      },
    ],
    keyPoints: [
      "Cascade сравнивает происхождение, importance и layers до сравнения specificity селекторов.",
      ":where позволяет добавить контекст селектора с нулевым вкладом в его specificity.",
      "Явный порядок слоёв и короткие классы уменьшают потребность в !important и усилении селекторов.",
    ],
    sourceIds: [
      "hackfrontend:html-and-css/cascad",
      "hackfrontend:html-and-css/css-selector-specificity",
    ],
    references: [
      {
        label: "Hack Frontend — CSS cascade",
        url: "https://www.hackfrontend.com/ru/docs/html-and-css/cascad",
        kind: "topic-source",
      },
      {
        label: "Hack Frontend — specificity",
        url: "https://www.hackfrontend.com/ru/docs/html-and-css/css-selector-specificity",
        kind: "topic-source",
      },
      {
        label: "MDN CSS Guide — Introduction to the cascade",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction",
        kind: "primary",
      },
      {
        label: "MDN CSS Guide — Specificity",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity",
        kind: "primary",
      },
    ],
  },
];
