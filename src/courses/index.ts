import type { CourseInfo } from './types'

/** Ready-made courses. Word lists load on demand so they don't weigh down the app. */
export const COURSES: CourseInfo[] = [
  {
    id: 'es-c1',
    name: 'ספרדית C1',
    description: 'אוצר מילים מתקדם: מילות קישור, פעלים, ביטויים, חברה, כלכלה ועוד',
    level: 'C1',
    sourceLang: 'he',
    targetLang: 'es',
    load: () => import('./es-c1').then((m) => m.default),
  },
]
