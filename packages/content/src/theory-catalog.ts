import type { TheoryArticle } from "@mentor/shared";

import { advancedTheoryArticles } from "./theory-catalog-advanced.js";

export const rawTheoryArticles: TheoryArticle[] = [
  {
    id: "theory-js-closures",
    version: 1,
    topic: "javascript",
    slug: "javascript-closures",
    title: "Замыкания и лексическое окружение",
    summary:
      "Замыкание позволяет функции продолжать обращаться к переменным из места своего создания. Это лежит в основе фабрик функций, приватного состояния, обработчиков событий и многих React-хуков.",
    estimatedMinutes: 7,
    relatedContentIds: ["js-closure-scope-001", "js-var-loop-006"],
    sections: [
      {
        heading: "Что именно сохраняет функция",
        paragraphs: [
          "При создании функция получает связь с окружающим лексическим окружением. Если функция позже вызывается в другом месте, поиск внешних переменных всё равно начинается там, где функция была объявлена, а не там, где её вызвали.",
          "Замыкание не создаёт замороженную копию каждого значения. Оно сохраняет доступ к привязкам переменных, поэтому последующее изменение такой переменной будет заметно всем функциям, которые используют то же окружение.",
        ],
        example: {
          title: "Независимые счётчики запросов",
          language: "javascript",
          code: `function createRequestCounter(scope) {
  let completed = 0;

  return () => {
    completed += 1;
    return \`\${scope}: \${completed}\`;
  };
}

const profileRequests = createRequestCounter("profile");
const searchRequests = createRequestCounter("search");

console.log(profileRequests()); // profile: 1
console.log(profileRequests()); // profile: 2
console.log(searchRequests());  // search: 1`,
          explanation:
            "Каждый вызов фабрики создаёт отдельное окружение со своей переменной completed. Возвращённые функции имеют одинаковый код, но работают с разными состояниями.",
        },
      },
      {
        heading: "Типичная ошибка в цикле",
        paragraphs: [
          "Если несколько callbacks замыкают одну переменную, к моменту вызова они могут увидеть её последнее значение. Объявление счётчика через let создаёт отдельную привязку для каждой итерации и обычно устраняет эту ошибку.",
          "Замыкания удерживают доступные им объекты, пока жива сама функция. Поэтому долгоживущий обработчик не должен случайно захватывать крупные данные, которые больше не нужны приложению.",
        ],
      },
    ],
    keyPoints: [
      "Область поиска внешних переменных определяется местом объявления функции.",
      "Несколько функций могут разделять одну изменяемую привязку или иметь независимые окружения.",
      "Замыкание полезно для инкапсуляции, но может продлевать время жизни захваченных объектов.",
    ],
    sourceIds: ["hackfrontend:javascript/closures"],
    references: [
      {
        label: "Hack Frontend — замыкания",
        url: "https://www.hackfrontend.com/ru/docs/javascript/closures",
        kind: "topic-source",
      },
      {
        label: "MDN JavaScript Guide — Closures",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-ts-generics",
    version: 1,
    topic: "typescript",
    slug: "typescript-generics",
    title: "Generics без потери информации о типе",
    summary:
      "Generic-параметры связывают типы входных и выходных данных. В отличие от any, они позволяют создавать переиспользуемые функции и структуры, не выключая проверку типов.",
    estimatedMinutes: 8,
    relatedContentIds: ["ts-generic-design-008", "ts-keyof-operator-003"],
    sections: [
      {
        heading: "Связь вместо неопределённости",
        paragraphs: [
          "Параметр типа обозначает отношение между несколькими позициями API. Если функция принимает T и возвращает T, компилятор сохраняет конкретный тип аргумента и переносит его в результат вызова.",
          "Generic нужен не каждой функции. Если параметр типа используется только один раз и ничего не связывает, обычный конкретный тип или union часто выражает намерение понятнее.",
        ],
        example: {
          title: "Индексирование сущностей с сохранением их формы",
          language: "typescript",
          code: `type Entity = { id: string };

function indexById<T extends Entity>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

const projects = [
  { id: "p1", title: "Mentor", archived: false },
  { id: "p2", title: "Docs", archived: true },
];

const byId = indexById(projects);
const project = byId.get("p1");
// project: { id: string; title: string; archived: boolean } | undefined`,
          explanation:
            "Ограничение T extends Entity гарантирует наличие id, а T в результате сохраняет остальные поля конкретного объекта. При использовании any эта информация была бы потеряна.",
        },
      },
      {
        heading: "Constraints и keyof",
        paragraphs: [
          "Ограничение extends описывает минимальные возможности типа. Оно не превращает результат в тип ограничения: конкретная структура по-прежнему сохраняется и доступна вызывающему коду.",
          "Связка K extends keyof T полезна для безопасного доступа к свойствам. Она запрещает ключи, отсутствующие в объекте, и позволяет вывести тип значения как T[K].",
        ],
      },
    ],
    keyPoints: [
      "Generic-параметр должен выражать связь между типами, а не заменять любое значение.",
      "Constraint задаёт обязательную минимальную форму и сохраняет более конкретный тип.",
      "Вывод типов обычно сокращает вызов, но явный type argument полезен при неоднозначности.",
    ],
    sourceIds: ["hackfrontend:typescript/generic"],
    references: [
      {
        label: "Hack Frontend — generics",
        url: "https://www.hackfrontend.com/ru/docs/typescript/generic",
        kind: "topic-source",
      },
      {
        label: "TypeScript Handbook — Generics",
        url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-react-reconciliation",
    version: 1,
    topic: "react",
    slug: "react-reconciliation-and-keys",
    title: "Reconciliation, identity и стабильные key",
    summary:
      "React сопоставляет элементы между рендерами по типу, позиции и key. Стабильная идентичность позволяет сохранить локальное состояние нужного компонента и обновить только изменившиеся части дерева.",
    estimatedMinutes: 7,
    relatedContentIds: ["react-reconciliation-001", "react-list-keys-002"],
    sections: [
      {
        heading: "Как React узнаёт прежний элемент",
        paragraphs: [
          "JSX создаёт новое описание интерфейса на каждом рендере. React сравнивает его с предыдущим деревом и решает, какие экземпляры компонентов можно сохранить, а какие нужно создать или удалить.",
          "Для соседей в массиве key является частью идентичности. Он должен происходить из данных и оставаться тем же для одной сущности при сортировке, фильтрации и вставке элементов.",
        ],
        example: {
          title: "Список сохраняет состояние правильной строки",
          language: "tsx",
          code: `type Project = { id: string; title: string };

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <ul>
      {projects.map((project) => (
        <ProjectRow key={project.id} project={project} />
      ))}
    </ul>
  );
}`,
          explanation:
            "При изменении порядка project.id продолжает обозначать тот же проект. Индекс массива связал бы состояние строки с позицией и мог перенести его на другой проект.",
        },
      },
      {
        heading: "Когда состояние сохраняется или сбрасывается",
        paragraphs: [
          "Состояние обычно сохраняется, если в той же позиции остаётся компонент того же типа с тем же key. Смена типа или key сообщает React, что это уже другая сущность, поэтому старое поддерево размонтируется.",
          "Случайный key создаёт новую идентичность при каждом рендере. Это приводит к повторному монтированию, потере введённых данных и лишней работе вместо ожидаемой оптимизации.",
        ],
      },
    ],
    keyPoints: [
      "Key описывает идентичность сущности среди соседних элементов, а не её текущую позицию.",
      "Стабильный тип и key помогают React сохранить экземпляр компонента и его состояние.",
      "Изменение key можно использовать намеренно, когда состояние действительно нужно сбросить.",
    ],
    sourceIds: ["hackfrontend:react/reconciliation"],
    references: [
      {
        label: "Hack Frontend — reconciliation",
        url: "https://www.hackfrontend.com/ru/docs/react/reconciliation",
        kind: "topic-source",
      },
      {
        label: "React documentation — Rendering Lists",
        url: "https://react.dev/learn/rendering-lists",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-browser-cors",
    version: 1,
    topic: "browser",
    slug: "browser-cors",
    title: "CORS как протокол разрешения cross-origin запросов",
    summary:
      "Same-origin policy ограничивает чтение ответов с другого origin в браузере. CORS позволяет серверу явно сообщить, каким источникам, методам и заголовкам разрешён доступ.",
    estimatedMinutes: 8,
    relatedContentIds: ["browser-cors-policy-001", "browser-fetch-status-007"],
    sections: [
      {
        heading: "Origin и роль браузера",
        paragraphs: [
          "Origin состоит из схемы, имени хоста и порта. Изменение любой из этих частей создаёт другой origin, даже если оба адреса принадлежат одному продукту.",
          "CORS проверяется браузером, а не заменяет серверную авторизацию. Прямой HTTP-клиент всё ещё может отправить запрос, поэтому API обязан самостоятельно проверять токены и права пользователя.",
        ],
        example: {
          title: "Разрешение конкретного web-клиента",
          language: "javascript",
          code: `// Ответ API на запрос от https://app.example.test
reply.header("Access-Control-Allow-Origin", "https://app.example.test");
reply.header("Vary", "Origin");

// Клиентский запрос с cookie требует отдельного разрешения credentials.
await fetch("https://api.example.test/profile", {
  credentials: "include",
});`,
          explanation:
            "Разрешается точный origin, а Vary сообщает кэшу, что ответ зависит от Origin. Для credentialed-запроса нельзя использовать wildcard вместо конкретного origin.",
        },
      },
      {
        heading: "Simple request и preflight",
        paragraphs: [
          "Некоторые запросы браузер отправляет сразу и затем проверяет CORS-заголовки ответа. Для методов или заголовков вне безопасного набора сначала выполняется OPTIONS preflight с описанием будущего запроса.",
          "Успешный preflight разрешает браузеру отправить основной запрос, но не гарантирует его успех. Основной маршрут всё равно может вернуть ошибку валидации, авторизации или бизнес-правил.",
        ],
      },
    ],
    keyPoints: [
      "CORS управляет доступом браузерного JavaScript к ответу, но не является системой авторизации.",
      "Credentialed-запросы требуют конкретного Allow-Origin и явного разрешения credentials.",
      "Preflight проверяет допустимость метода и заголовков до отправки основного запроса.",
    ],
    sourceIds: ["hackfrontend:general-questions/cors"],
    references: [
      {
        label: "Hack Frontend — CORS",
        url: "https://www.hackfrontend.com/ru/docs/general-questions/cors",
        kind: "topic-source",
      },
      {
        label: "MDN HTTP Guide — CORS",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-node-event-loop",
    version: 1,
    topic: "node",
    slug: "node-event-loop",
    title: "Event loop Node.js и неблокирующий ввод-вывод",
    summary:
      "Node.js выполняет JavaScript callbacks в основном потоке, а ожидание многих операций ввода-вывода передаёт системе и libuv. Event loop возвращает готовые callbacks в определённых фазах.",
    estimatedMinutes: 8,
    relatedContentIds: ["node-next-tick-003", "node-event-loop-008"],
    sections: [
      {
        heading: "Почему один JavaScript-поток обслуживает много операций",
        paragraphs: [
          "Асинхронный вызов регистрирует работу и быстро возвращает управление. Пока файловая система или сеть выполняет операцию, JavaScript-поток может обрабатывать другие callbacks.",
          "Неблокирующий ввод-вывод не делает тяжёлые вычисления бесплатными. Долгий синхронный callback занимает основной поток и задерживает таймеры, сетевые события и ответы всем остальным клиентам процесса.",
        ],
        example: {
          title: "Синхронная часть и callback чтения файла",
          language: "javascript",
          code: `import { readFile } from "node:fs";

console.log("start");

readFile(new URL("./settings.json", import.meta.url), "utf8", (error, text) => {
  if (error) {
    console.error(error.message);
    return;
  }
  console.log("loaded", text.length);
});

console.log("request registered");`,
          explanation:
            "Обе синхронные строки выводятся до callback. Само чтение происходит асинхронно, а готовый callback будет выполнен event loop, когда операция завершится.",
        },
      },
      {
        heading: "Фазы и осторожность с порядком",
        paragraphs: [
          "Event loop содержит отдельные очереди для таймеров, I/O, setImmediate и закрытия handles. process.nextTick использует отдельную очередь и выполняется до перехода к следующей фазе.",
          "Не следует строить бизнес-логику на случайном порядке setTimeout с нулевой задержкой и setImmediate вне определённого контекста. Таймер задаёт минимальный порог, а не точный момент исполнения.",
        ],
      },
    ],
    keyPoints: [
      "Асинхронный I/O освобождает JavaScript-поток на время ожидания внешней операции.",
      "Долгие синхронные callbacks блокируют event loop и увеличивают задержку всего процесса.",
      "Таймер задаёт минимальную задержку, а фактический запуск зависит от текущей работы цикла.",
    ],
    sourceIds: ["hackfrontend:javascript/event-loop"],
    references: [
      {
        label: "Hack Frontend — JavaScript event loop",
        url: "https://www.hackfrontend.com/ru/docs/javascript/event-loop",
        kind: "topic-source",
      },
      {
        label: "Node.js documentation — The Event Loop",
        url: "https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-css-flexbox",
    version: 1,
    topic: "css",
    slug: "css-flexbox-layout",
    title: "Flexbox: главная ось, перенос и сжатие элементов",
    summary:
      "Flexbox раскладывает элементы вдоль главной и поперечной осей. Итоговый размер зависит от flex-basis, доступного пространства, коэффициентов grow и shrink, а также минимальных размеров содержимого.",
    estimatedMinutes: 7,
    relatedContentIds: ["css-flex-min-width-003", "css-bfc-layout-008"],
    sections: [
      {
        heading: "Оси и распределение пространства",
        paragraphs: [
          "flex-direction определяет главную ось. justify-content распределяет свободное место вдоль неё, а align-items управляет выравниванием элементов по поперечной оси.",
          "Сокращение flex объединяет grow, shrink и basis. Значение basis участвует в первоначальном расчёте, после чего свободное или недостающее пространство распределяется между элементами.",
        ],
        example: {
          title: "Адаптивный ряд карточек без фиксированной ширины",
          language: "css",
          code: `.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.card {
  flex: 1 1 16rem;
  min-width: 0;
}

.card__title {
  overflow-wrap: anywhere;
}`,
          explanation:
            "Карточка начинает расчёт примерно с 16rem, может расширяться и сжиматься, а wrap переносит её при нехватке места. min-width: 0 разрешает сжатие ниже автоматического минимального размера содержимого.",
        },
      },
      {
        heading: "Почему элемент иногда не сжимается",
        paragraphs: [
          "У flex item автоматический минимальный размер может зависеть от содержимого. Длинная непрерывная строка или вложенный элемент поэтому способен расширить контейнер, несмотря на flex-shrink.",
          "Перед добавлением overflow или фиксированной ширины стоит проверить min-width, перенос текста и реальный flex-basis. Это обычно точнее устраняет причину переполнения.",
        ],
      },
    ],
    keyPoints: [
      "justify-content работает по главной оси, а align-items — по поперечной.",
      "flex-basis задаёт исходную основу расчёта до распределения свободного пространства.",
      "min-width: 0 часто необходим вложенному flex item с длинным содержимым.",
    ],
    sourceIds: ["hackfrontend:html-and-css/flex-grid"],
    references: [
      {
        label: "Hack Frontend — Flexbox и Grid",
        url: "https://www.hackfrontend.com/ru/docs/html-and-css/flex-grid",
        kind: "topic-source",
      },
      {
        label: "MDN CSS Guide — Basic concepts of flexbox",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-js-promise-chains",
    version: 1,
    topic: "javascript",
    slug: "javascript-promise-chains",
    title: "Promise-цепочки, композиция и распространение ошибок",
    summary:
      "Каждый вызов then, catch или finally создаёт новый Promise. Понимание возвращаемого значения, плавающих операций и границ обработки ошибок позволяет собирать предсказуемые асинхронные сценарии.",
    estimatedMinutes: 9,
    relatedContentIds: ["js-promise-microtask-005", "js-event-loop-queue-002"],
    sections: [
      {
        heading: "Результат обработчика становится входом следующего шага",
        paragraphs: [
          "Обработчик then может вернуть обычное значение или Promise. Обычное значение превращается в fulfilled-результат следующего звена, а возвращённый Promise сначала дожидается завершения и только затем передаёт итог дальше по цепочке.",
          "Если асинхронная операция запущена внутри then, но не возвращена, следующий обработчик не может дождаться её результата. Такая плавающая операция затрудняет обработку ошибок и создаёт гонки между зависимыми шагами.",
        ],
        example: {
          title: "Загрузка связанных данных без плавающих Promise",
          language: "javascript",
          code: `function requestJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return response.json();
  });
}

function loadProject(projectId) {
  return requestJson(\`/api/projects/\${projectId}\`)
    .then((project) => requestJson(\`/api/users/\${project.ownerId}\`)
      .then((owner) => ({ project, owner })))
    .catch((error) => ({ error: error.message }));
}`,
          explanation:
            "Каждый вложенный запрос возвращается вызывающему звену, поэтому результат владельца и возможная ошибка остаются частью одной отслеживаемой цепочки.",
        },
      },
      {
        heading: "Обработка ошибок и параллельные операции",
        paragraphs: [
          "Исключение внутри обработчика превращает новый Promise в rejected-состояние. Поиск обработчика продолжается вниз по цепочке до ближайшего catch. Если catch возвращает fallback, последующие звенья снова получают fulfilled-результат; для продолжения ошибки её нужно выбросить повторно.",
          "Независимые операции выгодно запускать до ожидания и собирать через Promise.all. Он отклоняет свой результат при первой ошибке, но сам по себе не отменяет уже начатые запросы; отмена базовой операции требует отдельного механизма вроде AbortController.",
        ],
      },
    ],
    keyPoints: [
      "then, catch и finally возвращают новый Promise, а не изменяют исходный объект.",
      "Асинхронную операцию внутри обработчика нужно вернуть, чтобы цепочка дождалась её завершения.",
      "Promise.all подходит независимым операциям, но отклонение результата не отменяет остальные задачи.",
    ],
    sourceIds: ["hackfrontend:javascript/promise-chaining"],
    references: [
      {
        label: "Hack Frontend — цепочки Promise",
        url: "https://www.hackfrontend.com/ru/docs/javascript/promise-chaining",
        kind: "topic-source",
      },
      {
        label: "MDN JavaScript Guide — Using promises",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-ts-mapped-types",
    version: 1,
    topic: "typescript",
    slug: "typescript-mapped-types",
    title: "Mapped types как преобразование формы объекта",
    summary:
      "Mapped type проходит по union ключей и строит новое свойство для каждого ключа. Так можно синхронно менять обязательность, readonly-модификатор или тип значений без ручного дублирования модели.",
    estimatedMinutes: 8,
    relatedContentIds: ["ts-keyof-operator-003", "ts-indexed-access-010"],
    sections: [
      {
        heading: "Итерация по keyof и сохранение связи с исходной моделью",
        paragraphs: [
          "Выражение K in keyof T создаёт свойство для каждого ключа T. Доступ T[K] сохраняет точный тип соответствующего значения, поэтому строковое поле не превращается в общий union со всеми остальными полями.",
          "Mapped type особенно полезен для производных контрактов: состояния формы, разрешений, признаков загрузки или конфигурации сериализации. При добавлении поля в исходную модель производный тип обновляется автоматически.",
        ],
        example: {
          title: "Состояние формы, связанное с типами полей",
          language: "typescript",
          code: `type FieldState<T> = {
  [K in keyof T]: {
    value: T[K];
    dirty: boolean;
    error?: string;
  };
};

type Profile = {
  name: string;
  age: number;
};

const profileForm: FieldState<Profile> = {
  name: { value: "Ada", dirty: true },
  age: { value: 36, dirty: false },
};`,
          explanation:
            "У name остаётся string, а у age — number. Добавление нового поля в Profile заставит TypeScript потребовать соответствующее состояние формы.",
        },
      },
      {
        heading: "Модификаторы и переименование ключей",
        paragraphs: [
          "Перед readonly или знаком вопроса можно поставить плюс или минус. Например, -readonly снимает неизменяемость, а -? делает все свойства обязательными. Без явного знака модификатор добавляется обычным способом.",
          "Конструкция as внутри mapped type позволяет переименовать или отфильтровать ключи. Это мощный инструмент, но длинная цепочка шаблонных строк иногда делает публичный контракт сложнее обычного явно названного типа.",
        ],
      },
    ],
    keyPoints: [
      "Mapped type строит свойства по union ключей, чаще всего полученному через keyof.",
      "Обращение T[K] сохраняет связь между конкретным ключом и типом его значения.",
      "Модификаторы readonly и optional можно добавлять или удалять во время преобразования.",
    ],
    sourceIds: ["hackfrontend:typescript/mapped-types"],
    references: [
      {
        label: "Hack Frontend — mapped types",
        url: "https://www.hackfrontend.com/ru/docs/typescript/mapped-types",
        kind: "topic-source",
      },
      {
        label: "TypeScript Handbook — Mapped Types",
        url: "https://www.typescriptlang.org/docs/handbook/2/mapped-types.html",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-react-state-queue",
    version: 1,
    topic: "react",
    slug: "react-state-update-queue",
    title: "Очередь обновлений React и функциональный setState",
    summary:
      "State внутри одного рендера ведёт себя как снимок. React ставит обновления в очередь и обрабатывает их после завершения обработчика, а updater-функции позволяют последовательно вычислить новое значение.",
    estimatedMinutes: 8,
    relatedContentIds: ["react-state-batching-004", "react-state-snapshot-006"],
    sections: [
      {
        heading: "Почему три setCount(count + 1) не дают плюс три",
        paragraphs: [
          "Переменная state не меняется внутри уже выполняющегося обработчика: каждый вызов видит значение из текущего рендера. Несколько одинаковых setCount(count + 1) поэтому предлагают React одно и то же следующее значение.",
          "Если новый state зависит от предыдущего, нужно передать updater-функцию. React помещает такие функции в очередь и во время следующего рендера последовательно передаёт результат одной функции в следующую.",
        ],
        example: {
          title: "Три последовательных обновления счётчика",
          language: "tsx",
          code: `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  const addThree = () => {
    setCount((current) => current + 1);
    setCount((current) => current + 1);
    setCount((current) => current + 1);
  };

  return <button onClick={addThree}>Счётчик: {count}</button>;
}`,
          explanation:
            "Каждый updater получает результат предыдущего, поэтому один обработчик увеличивает значение на три без чтения устаревшего снимка count.",
        },
      },
      {
        heading: "Batching и границы пользовательского события",
        paragraphs: [
          "React ждёт завершения кода обработчика перед обработкой поставленных обновлений. Такое объединение предотвращает промежуточные рендеры, в которых обновилась только часть связанного состояния.",
          "Отдельные намеренные события пользователя не объединяются в одну общую очередь. Updater должен быть чистой функцией: он вычисляет следующее значение из аргумента и не выполняет запросы, запись в storage или другие побочные эффекты.",
        ],
      },
    ],
    keyPoints: [
      "State в обработчике является снимком конкретного рендера и не меняется немедленно.",
      "Функциональный updater нужен, когда следующее значение зависит от предыдущего состояния.",
      "React объединяет обновления обработчика и применяет очередь после завершения его кода.",
    ],
    sourceIds: ["hackfrontend:react/react-batching"],
    references: [
      {
        label: "Hack Frontend — React batching",
        url: "https://www.hackfrontend.com/ru/docs/react/react-batching",
        kind: "topic-source",
      },
      {
        label: "React documentation — Queueing a Series of State Updates",
        url: "https://react.dev/learn/queueing-a-series-of-state-updates",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-browser-web-storage",
    version: 1,
    topic: "browser",
    slug: "browser-web-storage",
    title: "Web Storage: область, время жизни и безопасный формат данных",
    summary:
      "localStorage и sessionStorage дают синхронное хранилище строк внутри origin. Различия во времени жизни, обработка повреждённых данных и версионирование формата важнее простого вызова setItem.",
    estimatedMinutes: 8,
    relatedContentIds: ["browser-local-storage-003", "browser-http-only-cookie-004"],
    sections: [
      {
        heading: "localStorage, sessionStorage и границы origin",
        paragraphs: [
          "Оба хранилища разделяются по origin и принимают только строки. localStorage переживает перезапуск браузера, а sessionStorage дополнительно разделяется по вкладкам и очищается после завершения соответствующей сессии страницы.",
          "API работает синхронно и блокирует выполнение JavaScript на время операции. Поэтому Web Storage подходит небольшим настройкам, но не крупным наборам данных и не частой записи в горячем цикле интерфейса.",
        ],
        example: {
          title: "Версионированное сохранение фильтров",
          language: "typescript",
          code: `type Filters = { topic: string; onlyDue: boolean };
const storageKey = "mentor:filters:v1";

export function saveFilters(value: Filters): void {
  localStorage.setItem(storageKey, JSON.stringify({ version: 1, value }));
}

export function readFilters(): Filters | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return parsed?.version === 1 ? parsed.value : null;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}`,
          explanation:
            "Ключ содержит версию контракта, а чтение допускает отсутствие или повреждение значения. Недоверенные данные не используются до проверки ожидаемой версии и формы.",
        },
      },
      {
        heading: "Синхронизация вкладок и ограничения безопасности",
        paragraphs: [
          "Событие storage уведомляет другие документы того же origin об изменении, но обычно не вызывается в документе, который выполнил запись. Это позволяет обновлять настройки между вкладками без постоянного опроса.",
          "Доступный JavaScript может прочитать Web Storage, поэтому там нельзя считать секрет защищённым от XSS. Токены и персональные данные требуют отдельной модели угроз, минимального срока жизни и серверной проверки прав.",
        ],
      },
    ],
    keyPoints: [
      "Web Storage хранит строки и изолируется по схеме, хосту и порту origin.",
      "localStorage сохраняется дольше, а sessionStorage дополнительно разделяется по вкладкам.",
      "Чтение JSON должно учитывать отсутствие, повреждение и устаревшую версию сохранённых данных.",
    ],
    sourceIds: ["hackfrontend:general-questions/storage-in-the-browser"],
    references: [
      {
        label: "Hack Frontend — хранение данных в браузере",
        url: "https://www.hackfrontend.com/ru/docs/general-questions/storage-in-the-browser",
        kind: "topic-source",
      },
      {
        label: "MDN Web APIs — Web Storage API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-node-es-modules",
    version: 1,
    topic: "node",
    slug: "node-es-modules",
    title: "ES modules в Node.js: границы пакета, URL и imports",
    summary:
      "Node.js определяет формат модулей по расширению и package.json. В ESM относительные импорты требуют явного пути, а import.meta.url заменяет несуществующие глобальные __filename и __dirname.",
    estimatedMinutes: 9,
    relatedContentIds: ["node-module-cache-010"],
    sections: [
      {
        heading: "Как Node.js выбирает формат модуля",
        paragraphs: [
          "Расширение .mjs всегда обозначает ES module, а .cjs — CommonJS. Для обычных .js ближайшее поле type в package.json задаёт режим package scope: module включает ESM, а commonjs сохраняет CommonJS.",
          "Относительный import в ESM использует полный спецификатор с расширением файла. Это делает разрешение пути явным и ближе к URL-семантике, которую Node применяет к ES modules.",
        ],
        example: {
          title: "Чтение файла рядом с текущим модулем",
          language: "javascript",
          code: `import { readFile } from "node:fs/promises";

export async function loadConfig() {
  const configUrl = new URL("./config.json", import.meta.url);
  const source = await readFile(configUrl, "utf8");
  return JSON.parse(source);
}

const config = await loadConfig();
console.log(config);`,
          explanation:
            "URL строится относительно адреса текущего модуля, а не рабочей директории процесса. Код продолжит находить config.json при запуске из другого каталога.",
        },
      },
      {
        heading: "Exports, imports и совместимость с CommonJS",
        paragraphs: [
          "Поля exports и imports в package.json позволяют описать публичные entry points и внутренние псевдонимы пакета. Они помогают не превращать случайную внутреннюю структуру каталогов в долгосрочный публичный контракт.",
          "ESM и CommonJS имеют разные модели загрузки и экспорта, поэтому межоперабельность стоит проверять на реальном пакете. Новый серверный код проще поддерживать, когда внутри одного package scope выбран один основной формат.",
        ],
      },
    ],
    keyPoints: [
      "Формат .js определяется ближайшим package.json, а .mjs и .cjs задают его явно.",
      "В ESM относительные imports указывают расширение, а локальные файлы удобно разрешать через import.meta.url.",
      "Package exports фиксирует поддерживаемые точки входа и скрывает случайные внутренние пути.",
    ],
    sourceIds: ["hackfrontend:architecture/module"],
    references: [
      {
        label: "Hack Frontend — модульная архитектура",
        url: "https://www.hackfrontend.com/ru/docs/architecture/module",
        kind: "topic-source",
      },
      {
        label: "Node.js documentation — ECMAScript modules",
        url: "https://nodejs.org/api/esm.html",
        kind: "primary",
      },
    ],
  },
  {
    id: "theory-css-grid-layout",
    version: 1,
    topic: "css",
    slug: "css-grid-layout",
    title: "CSS Grid: треки, auto-placement и адаптивные колонки",
    summary:
      "Grid управляет строками и колонками как единой двумерной системой. Явные треки, единица fr и алгоритм auto-placement позволяют строить адаптивные сетки без вычисления ширины каждого элемента.",
    estimatedMinutes: 8,
    relatedContentIds: ["css-grid-auto-fit-004", "css-container-query-009"],
    sections: [
      {
        heading: "Треки, линии и свободное пространство",
        paragraphs: [
          "grid-template-columns и grid-template-rows создают явную сетку треков. Элементы можно размещать между линиями вручную, а без явных координат их последовательно раскладывает алгоритм auto-placement.",
          "Единица fr получает долю свободного пространства после учёта фиксированных размеров и gap. Функция minmax задаёт нижнюю и верхнюю границу трека, поэтому колонка может оставаться читаемой и одновременно расширяться.",
        ],
        example: {
          title: "Сетка карточек с автоматическим числом колонок",
          language: "css",
          code: `.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

.catalog__featured {
  grid-column: span 2;
}

@media (max-width: 36rem) {
  .catalog__featured {
    grid-column: auto;
  }
}`,
          explanation:
            "auto-fit создаёт столько колонок не уже 16rem, сколько помещается в контейнере. Свободное место распределяется через 1fr, а выделенная карточка занимает два трека только на достаточной ширине.",
        },
      },
      {
        heading: "Явная и неявная сетка",
        paragraphs: [
          "Если элемент попадает за пределы объявленных треков, Grid создаёт неявные строки или колонки. Их размеры можно контролировать через grid-auto-rows и grid-auto-columns, иначе браузер использует автоматический размер.",
          "Визуальное перемещение через grid-area не должно разрушать логический порядок документа. Клавиатурная навигация и чтение assistive technology обычно следуют DOM, поэтому исходная разметка должна оставаться осмысленной.",
        ],
      },
    ],
    keyPoints: [
      "Grid задаёт двумерные треки, а auto-placement размещает элементы без ручных координат.",
      "fr распределяет оставшееся пространство, а minmax ограничивает допустимый размер трека.",
      "Визуальная перестановка не заменяет правильный логический порядок элементов в DOM.",
    ],
    sourceIds: ["hackfrontend:html-and-css/flex-grid"],
    references: [
      {
        label: "Hack Frontend — Flexbox и Grid",
        url: "https://www.hackfrontend.com/ru/docs/html-and-css/flex-grid",
        kind: "topic-source",
      },
      {
        label: "MDN CSS Guide — Basic concepts of grid layout",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Basic_concepts",
        kind: "primary",
      },
    ],
  },
  ...advancedTheoryArticles,
];
