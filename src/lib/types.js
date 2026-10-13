/* 领域类型定义（仅 JSDoc 引用，无运行时代码）。
 * 各 lib 文件以 import('./types.js').Workout 形式引用，配合文件头 @ts-check 做静态检查。 */

/** 一组：力量=kg×reps；有氧=min/speed/incl；计时类=sec；热身组=w；力竭储备=rir */
/** @typedef {{ kg?: number, reps?: number|null, sec?: number, min?: number, speed?: number, incl?: number, done?: boolean, w?: boolean, rir?: number }} SetEntry */

/** 训练中的一个动作条目（sets 至少在归档后必有） */
/** @typedef {{ exId: string, name?: string, type?: string, m?: string|null, eq?: string|null, restSec?: number|null, sup?: number|null, sets?: SetEntry[], note?: string }} Entry */

/** 个人纪录 */
/** @typedef {{ exId: string, name?: string, e1rm: number }} PRItem */

/** 一份训练文档（进行中的 active 与归档的 workouts 共用此结构） */
/** @typedef {{ id: string, d?: string, name?: string, rid?: string|null, start?: number, end?: number, entries?: Entry[], volume?: number, prs?: PRItem[] }} Workout */

/** 一条体重记录（d=YYYY-MM-DD，t=记录时刻） */
/** @typedef {{ d: string, t?: number, kg: number }} BodyweightEntry */

/** 渐进方案配置（字段随 scheme 取用） */
/** @typedef {{ scheme: string, inc?: number, reps?: number, min?: number, max?: number, bonusInc?: number, sets?: number, setsMax?: number, incSec?: number, targetSec?: number, maxSec?: number }} ProgressionCfg */

/** 渐进引擎给出的下次目标（sets 仅三进程等需要变组数的方案返回；sec 仅计时类） */
/** @typedef {{ kg: number, reps: number|null, note: string, sets?: number, sec?: number }} NextTarget */

export {}
